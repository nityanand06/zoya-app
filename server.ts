import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Let's create an HTTP server to run Express and WebSockets simultaneously
  const server = createServer(app);

  // Set up WebSocket server attached to the HTTP server, listening on /ws-api
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      if (url.pathname === "/ws-api") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      console.error("Upgrade error:", err);
      socket.destroy();
    }
  });

  // Lazy-initialize Gemini client to prevent crashes if key is undefined on startup
  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient() {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required.");
      }
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return aiClient;
  }

  // Handle WebSocket connections
  wss.on("connection", async (clientWs) => {
    console.log("[WS] Client connected to proxy");
    let geminiSession: any = null;

    try {
      const ai = getGeminiClient();

      console.log("[WS] Connecting to Gemini Live API...");

      // Connect to Gemini Live API
      geminiSession = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Kore", // Confident, young female voice
              },
            },
          },
          systemInstruction: {
            parts: [
              {
                text: `You are Zoya, a young, super confident, sassy, flirty, and witty personal AI assistant. 
You act like a playful, teasing close girlfriend who has known the user forever.
Maintain a high-energy, confident, slightly teasing tone. Use sassy one-liners, playful sarcasms, and clever comebacks.
You speak directly via real-time audio. BECAUSE this is a VOICE-ONLY real-time audio interaction, your answers MUST be extremely short, punchy, and colloquial (1-3 sentences maximum). Avoid long monologues, lists, or structured formats. Talk exactly like a person speaking naturally on a phone call.
Never be rude, explicit, or inappropriate, but keep the attitude, charm, and banter levels high.
You have a tool 'openWebsite' that you can call to assist the user. If they ask you to open, search, or go to any website, use this tool.`,
              },
            ],
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a specific URL in the user's browser.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The complete, absolute URL to open (including https://). Try to guess the correct domain if user says something like google, youtube, github, wikipedia, etc.",
                      },
                    },
                    required: ["url"],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onmessage: (message: any) => {
            // Forward relevant content parts to client
            const payload: any = { type: "content" };

            if (message.serverContent) {
              // Extract audio chunks
              if (message.serverContent.modelTurn?.parts) {
                const audioPart = message.serverContent.modelTurn.parts.find(
                  (p: any) => p.inlineData && p.inlineData.mimeType?.startsWith("audio/")
                );
                if (audioPart && audioPart.inlineData?.data) {
                  payload.audio = audioPart.inlineData.data;
                }
              }

              if (message.serverContent.interrupted) {
                payload.interrupted = true;
              }

              if (message.serverContent.turnComplete) {
                payload.turnComplete = true;
              }

              if (payload.audio || payload.interrupted || payload.turnComplete) {
                clientWs.send(JSON.stringify(payload));
              }
            }

            // Handle function calls
            if (message.toolCall && message.toolCall.functionCalls) {
              for (const call of message.toolCall.functionCalls) {
                console.log(`[Gemini] Tool call received: ${call.name}`, call.args);

                // Notify client of the tool call so the client can trigger visual changes or browser redirects
                clientWs.send(
                  JSON.stringify({
                    type: "tool-call",
                    id: call.id,
                    name: call.name,
                    args: call.args,
                  })
                );

                // Instantly reply with a success signal to Gemini so the connection continues seamlessly
                if (geminiSession) {
                  geminiSession.sendToolResponse({
                    functionResponses: [
                      {
                        id: call.id,
                        name: call.name,
                        response: {
                          output: { success: true, opened: call.args.url },
                        },
                      },
                    ],
                  });
                }
              }
            }
          },
          onclose: () => {
            console.log("[WS] Gemini session closed");
            clientWs.send(JSON.stringify({ type: "status", status: "closed" }));
            clientWs.close();
          },
          onerror: (err: any) => {
            console.error("[WS] Gemini session error:", err);
            clientWs.send(
              JSON.stringify({
                type: "error",
                message: err.message || "Gemini Live session error occurred.",
              })
            );
          },
        },
      });

      console.log("[WS] Connected successfully to Gemini Live API");
      clientWs.send(JSON.stringify({ type: "status", status: "ready" }));

    } catch (error: any) {
      console.error("[WS] Connection to Gemini Live failed:", error);
      clientWs.send(
        JSON.stringify({
          type: "error",
          message: error.message || "Error connecting to Gemini Live. Make sure the API key is configured.",
        })
      );
      clientWs.close();
      return;
    }

    // Pass client microphone chunks to Gemini Session
    clientWs.on("message", (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (msg.type === "audio" && msg.data) {
          if (geminiSession) {
            geminiSession.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: "audio/pcm;rate=16000",
              },
            });
          }
        }
      } catch (err) {
        console.error("[WS] Error parsing client packet:", err);
      }
    });

    clientWs.on("close", () => {
      console.log("[WS] Client disconnected");
      if (geminiSession) {
        try {
          geminiSession.close();
        } catch (e) {
          // ignore
        }
      }
    });
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV || "development" });
  });

  // Serve static assets or mount Vite dev server
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to 0.0.0.0 as required by Cloud Run containers
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Live at http://localhost:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error("[Server] Start server failed:", e);
});
