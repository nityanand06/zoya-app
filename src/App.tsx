import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Power, RefreshCw, Sparkles, User, AlertCircle, Sparkle } from "lucide-react";
import VoiceReactor from "./components/VoiceReactor";
import LogsPanel from "./components/LogsPanel";
import DurationChart from "./components/DurationChart";
import { ConnectionState, ToolCallLog, InteractionSession } from "./types";
import { pcmFloat32To16BitBase64, base64ToFloat32 } from "./utils/audio";

export default function App() {
  const [logs, setLogs] = useState<ToolCallLog[]>([]);
  const [sessionState, setSessionState] = useState<ConnectionState>("disconnected");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Accent and color themes: 'Cyber-Indigo' or 'Neon-Rose'
  const [cyberMode, setCyberMode] = useState<"indigo" | "rose">(() => {
    try {
      const saved = localStorage.getItem("zoya_cyber_mode");
      if (saved === "rose" || saved === "indigo") return saved;
    } catch (e) {}
    return "indigo";
  });

  const toggleCyberMode = () => {
    setCyberMode((prev) => {
      const next = prev === "indigo" ? "rose" : "indigo";
      localStorage.setItem("zoya_cyber_mode", next);
      return next;
    });
  };

  // Stats storage and interaction tracking state
  const [stats, setStats] = useState<InteractionSession[]>(() => {
    try {
      const stored = localStorage.getItem("zoya_session_stats");
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
      }
    } catch (e) {
      console.warn("Could not read stats from localStorage", e);
    }

    // Default preseeded mock stats so the D3 line chart isn't blank on first visitor load
    const preseeded: InteractionSession[] = [];
    const now = Date.now();
    for (let i = 5; i > 0; i--) {
      preseeded.push({
        id: `seed-${i}`,
        timestamp: new Date(now - i * 6 * 1000), // Spaced by ~30 seconds for nice visuals
        durationSeconds: Math.floor(Math.random() * 25) + 8, // nice realistic session lengths e.g. 8s to 33s
      });
    }
    return preseeded;
  });

  // Audio nodes and references
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const speakerAnalyserRef = useRef<AnalyserNode | null>(null);
  
  // WebSocket and Synchronization States
  const wsRef = useRef<WebSocket | null>(null);
  const isReadyRef = useRef<boolean>(false);
  const isUserSpeakingRef = useRef<boolean>(false);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const sessionStartTimeRef = useRef<number | null>(null);

  // Periodic synchronization of conversational states (to sync Zoya's visual with audio buffer queues)
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isReadyRef.current) {
        const outputCtx = outputCtxRef.current;
        const isZoyaSpeaking = outputCtx && nextStartTimeRef.current > outputCtx.currentTime;
        
        if (isZoyaSpeaking) {
          setSessionState("speaking");
        } else if (isUserSpeakingRef.current) {
          setSessionState("listening");
        } else {
          setSessionState("idle");
        }
      }
    }, 60);

    return () => clearInterval(interval);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioAndConnection();
    };
  }, []);

  // Stops any active speech buffers
  const stopPlayback = () => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch (e) {
        // already stopped or not started
      }
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
  };

  const cleanupAudioAndConnection = () => {
    stopPlayback();

    // Check and record conversation statistics
    if (sessionStartTimeRef.current) {
      const duration = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
      if (duration >= 2) {
        const newSession: InteractionSession = {
          id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date(),
          durationSeconds: duration,
        };
        setStats((prev) => {
          const updated = [...prev, newSession].slice(-8); // Hold last 8 sessions for visualization
          localStorage.setItem("zoya_session_stats", JSON.stringify(updated));
          return updated;
        });
      }
      sessionStartTimeRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    micAnalyserRef.current = null;
    speakerAnalyserRef.current = null;
    isReadyRef.current = false;
    isUserSpeakingRef.current = false;
  };

  const startSession = async () => {
    cleanupAudioAndConnection();
    setErrorMsg(null);
    setSessionState("connecting");

    try {
      // 1. Capture user microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 2. Setup input Audio Context for mic recording (16kHz standard for Gemini)
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputCtxRef.current = inputCtx;

      const micAnalyser = inputCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyserRef.current = micAnalyser;

      const source = inputCtx.createMediaStreamSource(stream);
      source.connect(micAnalyser);

      // Create ScriptProcessor inside the input context to buffer/chunk mic data
      const processor = inputCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(inputCtx.destination);

      // 3. Setup output Audio Context for loudspeaker playback (24kHz standard for Gemini Live)
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputCtxRef.current = outputCtx;

      const speakerAnalyser = outputCtx.createAnalyser();
      speakerAnalyser.fftSize = 256;
      speakerAnalyserRef.current = speakerAnalyser;

      // 4. Connect Web Socket connection
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const ws = new WebSocket(`${protocol}//${host}/ws-api`);
      wsRef.current = ws;

      processor.onaudioprocess = (e) => {
        const channelData = e.inputBuffer.getChannelData(0);

        // Simple Root Mean Square (RMS) calculation to measure user's speech peaks
        let sum = 0;
        for (let i = 0; i < channelData.length; i++) {
          sum += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sum / channelData.length);
        const isSpeaking = rms > 0.015; // Noise gate threshold

        isUserSpeakingRef.current = isSpeaking;

        // If WebSocket is open and Gemini is ready, stream the mic chunk
        if (ws.readyState === WebSocket.OPEN && isReadyRef.current) {
          const base64 = pcmFloat32To16BitBase64(channelData);
          ws.send(JSON.stringify({ type: "audio", data: base64 }));
        }
      };

      ws.onopen = () => {
        console.log("[WS] Socket connected successfully.");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "status") {
            if (msg.status === "ready") {
              isReadyRef.current = true;
              setSessionState("idle");
              sessionStartTimeRef.current = Date.now();
            }
          }

          if (msg.type === "content") {
            // Handle active speaker interruptions properly
            if (msg.interrupted) {
              console.log("[WS] Gemini reports interruption from user voice. Halting speech outputs.");
              stopPlayback();
            }

            if (msg.audio) {
              playAudioChunk(msg.audio);
            }
          }

          if (msg.type === "tool-call") {
            handleToolCall(msg);
          }

          if (msg.type === "error") {
            console.error("[WS] Server Gemini Error:", msg.message);
            setErrorMsg(msg.message);
            setSessionState("error");
            cleanupAudioAndConnection();
          }
        } catch (err) {
          console.error("[Client] Failed to digest socket packet:", err);
        }
      };

      ws.onerror = (e) => {
        console.error("[WS] Connection Error:", e);
        setErrorMsg("Failed to connect to assistant backend socket.");
        setSessionState("error");
        cleanupAudioAndConnection();
      };

      ws.onclose = () => {
        console.log("[WS] Socket closed by server.");
        setSessionState("disconnected");
        cleanupAudioAndConnection();
      };

    } catch (err: any) {
      console.error("[Client] App startup failed:", err);
      setErrorMsg(err.message || "Failed to initialize audio contexts. Ensure mic permissions are granted.");
      setSessionState("error");
      cleanupAudioAndConnection();
    }
  };

  const playAudioChunk = (base64Audio: string) => {
    const ctx = outputCtxRef.current;
    const speakerAnalyser = speakerAnalyserRef.current;
    if (!ctx || !speakerAnalyser) return;

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const pcmData = base64ToFloat32(base64Audio);
    const audioBuffer = ctx.createBuffer(1, pcmData.length, 24000);
    audioBuffer.getChannelData(0).set(pcmData);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    
    // Connect output chunks to the canvas visual analyser and then to standard loudspeaker output
    source.connect(speakerAnalyser);
    speakerAnalyser.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    let startTime = nextStartTimeRef.current;
    
    // If we've lagged behind, start playing immediately with a tiny safety headroom
    if (startTime < currentTime) {
      startTime = currentTime + 0.015;
    }

    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    // Track active waveforms so we can kill them if interrupted
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((src) => src !== source);
    };
  };

  const handleToolCall = (call: any) => {
    const log: ToolCallLog = {
      id: call.id || Math.random().toString(36).substring(2, 9),
      name: call.name,
      args: call.args,
      timestamp: new Date().toLocaleTimeString(),
    };

    setLogs((prev) => [log, ...prev]);

    // Handle tool logic
    if (call.name === "openWebsite" && call.args?.url) {
      let destUrl = call.args.url;
      if (!/^https?:\/\//i.test(destUrl)) {
        destUrl = "https://" + destUrl;
      }
      try {
        window.open(destUrl, "_blank");
      } catch (e) {
        console.warn("Popup blocked inside sandboxed iframe. Manual action fallback initialized.");
      }
    }
  };

  const toggleSession = () => {
    if (sessionState === "disconnected" || sessionState === "error") {
      startSession();
    } else {
      cleanupAudioAndConnection();
      setSessionState("disconnected");
    }
  };

  const handleManualOpenUrl = (url: string) => {
    let destUrl = url;
    if (!/^https?:\/\//i.test(destUrl)) {
      destUrl = "https://" + destUrl;
    }
    window.open(destUrl, "_blank");
  };

  // Define descriptive labels depending on state
  const getStateLabel = () => {
    switch (sessionState) {
      case "disconnected":
        return { text: "Wake up Zoya", color: "text-slate-400 bg-slate-900 border-slate-800" };
      case "connecting":
        return { 
          text: "Connecting to Zoya...", 
          color: cyberMode === "rose"
            ? "text-pink-400 bg-pink-950/30 border-pink-800 animate-pulse"
            : "text-cyan-400 bg-cyan-950/30 border-cyan-800 animate-pulse"
        };
      case "idle":
        return { 
          text: "Zoya is listening... Speak up babe", 
          color: cyberMode === "rose"
            ? "text-rose-400 bg-rose-955/30 border-rose-800"
            : "text-indigo-400 bg-indigo-950/30 border-indigo-800"
        };
      case "listening":
        return { text: "Zoya is listening to you...", color: "text-emerald-400 bg-emerald-950/30 border-emerald-800 animate-pulse" };
      case "speaking":
        return { 
          text: "Zoya is speaking...", 
          color: cyberMode === "rose"
            ? "text-rose-400 bg-rose-955/30 border-rose-800 animate-bounce"
            : "text-pink-400 bg-pink-950/30 border-pink-800 animate-bounce"
        };
      case "error":
        return { text: "Offline Connection Limit", color: "text-red-400 bg-red-950/30 border-red-800" };
    }
  };

  const activeLabel = getStateLabel();

  return (
    <div className={`relative min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans px-4 py-6 md:p-8 antialiased transition-colors duration-1000 ${
      cyberMode === "rose" ? "selection:bg-pink-500 selection:text-slate-950" : "selection:bg-cyan-500 selection:text-slate-950"
    }`}>
      {/* Glow ambient panels background */}
      <div className={`absolute top-[10%] left-[5%] w-72 h-72 rounded-full blur-[120px] pointer-events-none transition-all duration-1000 ${
        cyberMode === "rose" ? "bg-rose-500/10" : "bg-indigo-500/10"
      }`} />
      <div className={`absolute bottom-[20%] right-[5%] w-80 h-80 rounded-full blur-[120px] pointer-events-none transition-all duration-1000 ${
        cyberMode === "rose" ? "bg-pink-500/10" : "bg-cyan-500/10"
      }`} />

      {/* Cybernetic header */}
      <header className="w-full max-w-lg mx-auto flex items-center justify-between z-20 gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${sessionState === 'disconnected' ? 'bg-slate-500' : sessionState === 'error' ? 'bg-red-500' : cyberMode === 'rose' ? 'bg-pink-400' : 'bg-cyan-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${sessionState === 'disconnected' ? 'bg-slate-600' : sessionState === 'error' ? 'bg-red-600' : cyberMode === 'rose' ? 'bg-pink-500' : 'bg-cyan-500'}`}></span>
          </div>
          <span className="text-xs font-mono tracking-widest text-slate-400 uppercase">
            System Live Proxy
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Cyber Mode Switch Button */}
          <button
            onClick={toggleCyberMode}
            className={`relative cursor-pointer group flex items-center gap-1.5 bg-slate-900 border px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition-all duration-300 ${
              cyberMode === "rose"
                ? "border-pink-800 text-pink-400 hover:border-pink-600 hover:text-pink-300 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
                : "border-indigo-850 text-indigo-400 hover:border-indigo-600 hover:text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
            }`}
            title={`Switch to ${cyberMode === 'indigo' ? 'Neon-Rose' : 'Cyber-Indigo'} theme`}
          >
            <Sparkles className={`w-3 h-3 transition-transform duration-500 group-hover:rotate-45 ${cyberMode === "rose" ? "text-pink-400" : "text-cyan-400"}`} />
            <span>{cyberMode === "indigo" ? "Cyber-Indigo" : "Neon-Rose"}</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800/80 px-2.5 py-1 rounded-full shrink-0">
            <Sparkle className={`w-3 h-3 animate-spin-[20s] ${cyberMode === 'rose' ? 'text-pink-400' : 'text-cyan-400'}`} />
            <span className="text-[10px] font-mono text-slate-400 uppercase">gemini bidi model</span>
          </div>
        </div>
      </header>

      {/* Main interface center card */}
      <main className="flex-1 flex flex-col items-center justify-center py-6 sm:py-8 z-10 w-full max-w-lg mx-auto select-none">
        
        {/* Animated Brand Title */}
        <div className="text-center mb-5">
          <h1 className={`text-3xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent flex items-center justify-center gap-2 font-sans transition-all duration-500 ${
            cyberMode === "rose"
              ? "bg-gradient-to-r from-pink-400 via-rose-200 to-rose-500"
              : "bg-gradient-to-r from-cyan-400 via-indigo-200 to-indigo-500"
          }`}>
            ZOYA <span className={`text-xs font-mono font-bold border px-1.5 py-0.5 rounded uppercase tracking-wide transition-all duration-500 ${
              cyberMode === "rose"
                ? "border-pink-500 text-pink-400 bg-pink-950/20"
                : "border-cyan-400 text-cyan-400 bg-cyan-950/20"
            }`}>Bidi AI</span>
          </h1>
          <p className="text-slate-400 text-xs md:text-sm mt-1 max-w-[280px] mx-auto leading-relaxed">
            Your sassy, witty, flirty AI BFF. Full Audio only conversation.
          </p>
        </div>

        {/* Central visual voice reactor */}
        <div className="my-1 md:my-3 flex justify-center items-center w-full">
          <VoiceReactor
            state={sessionState}
            micAnalyser={micAnalyserRef.current}
            speakerAnalyser={speakerAnalyserRef.current}
            theme={cyberMode}
          />
        </div>

        {/* Dynamic status pill */}
        <div className="mb-6 flex justify-center w-full">
          <div className={`px-4 py-1.5 rounded-full border text-xs font-mono font-medium flex items-center gap-2 shadow-lg transition-all duration-300 ${activeLabel.color}`}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>{activeLabel.text}</span>
          </div>
        </div>

        {/* Central mic activate reactor button */}
        <div className="flex flex-col items-center gap-4 w-full">
          <button
            onClick={toggleSession}
            className={`cursor-pointer group relative flex items-center justify-center w-20 h-20 rounded-full border transition-all duration-500 hover:scale-105 active:scale-95 ${
              sessionState === "disconnected"
                ? (cyberMode === "rose"
                    ? "bg-gradient-to-tr from-slate-950 to-slate-900 border-slate-800 text-slate-300 hover:border-pink-500/50 hover:text-white glow-pink"
                    : "bg-gradient-to-tr from-slate-950 to-slate-900 border-slate-800 text-slate-300 hover:border-indigo-500/50 hover:text-white glow-indigo"
                  )
                : sessionState === "error"
                ? "bg-red-950/30 border-red-700 text-red-400 hover:border-red-500"
                : sessionState === "connecting"
                ? (cyberMode === "rose"
                    ? "bg-pink-950/40 border-pink-700 text-pink-300 animate-pulse"
                    : "bg-cyan-950/40 border-cyan-700 text-cyan-300 animate-pulse"
                  )
                : (cyberMode === "rose"
                    ? "bg-gradient-to-tr from-pink-950 to-rose-900 border-pink-700 text-pink-200 glow-pink hover:from-pink-900 hover:to-rose-800"
                    : "bg-gradient-to-tr from-cyan-950 to-indigo-900 border-cyan-700 text-cyan-200 glow-cyan hover:from-cyan-900 hover:to-indigo-800"
                  )
            }`}
            title={sessionState === "disconnected" ? "Activate Zoya" : "Deactivate Zoya"}
          >
            {sessionState === "disconnected" ? (
              <Power className="w-8 h-8 group-hover:rotate-12 transition-transform" />
            ) : (
              <MicOff className="w-8 h-8 group-hover:scale-11 transition-transform" />
            )}

            {/* Orbiting ring glow indicator */}
            <span className={`absolute -inset-2.5 rounded-full border border-dashed opacity-30 transition-all duration-700 ${
              sessionState === "disconnected" 
                ? "border-slate-800 group-hover:scale-110" 
                : sessionState === "connecting"
                ? (cyberMode === "rose" ? "border-pink-500/60 animate-spin" : "border-cyan-500/60 animate-spin")
                : (cyberMode === "rose" ? "border-rose-500/70 animate-spin-[20s]" : "border-pink-500/70 animate-spin-[20s]")
            }`} />
          </button>

          <p className="text-[11px] font-mono tracking-wider text-slate-500 uppercase">
            {sessionState === "disconnected" ? "tap power key to activate zoya" : "tap key to interrupt & disconnect"}
          </p>
        </div>

        {/* Sassy conversational guidance cards */}
        {sessionState === "disconnected" && (
          <div className="mt-8 bg-slate-950 border border-slate-900 rounded-xl p-3.5 max-w-sm text-center">
            <span className={`text-[10px] font-mono uppercase tracking-widest block mb-1 ${
              cyberMode === "rose" ? "text-pink-400" : "text-cyan-400"
            }`}>
              Sample BANTER with Zoya
            </span>
            <p className="text-xs text-slate-400 italic">
              "Hey Zoya, are you free tonight?" or "Open Wikipedia" or "Take me to GitHub!"
            </p>
          </div>
        )}

        {/* Display clear descriptive error prompts to the user */}
        {errorMsg && (
          <div className="mt-6 flex gap-3.5 bg-red-950/40 border border-red-800/80 p-3.5 rounded-xl max-w-sm items-start shadow-xl animate-fade-in">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-left">
              <span className="text-xs font-mono font-bold text-red-400 uppercase block mb-0.5">
                Session Failure
              </span>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                {errorMsg}
              </p>
            </div>
          </div>
        )}

        {/* D3 Recent Session Engagement Pulse Chart */}
        <div className="w-full mt-2 animate-fade-in">
          <DurationChart data={stats} theme={cyberMode} />
        </div>
      </main>

      {/* Lower log proxy screen logs panel */}
      <footer className="w-full max-w-lg mx-auto mt-6 z-20">
        <LogsPanel logs={logs} onOpenUrl={handleManualOpenUrl} />
        
        {/* Humble and polished metadata tag */}
        <div className="text-center mt-5">
          <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest leading-none">
            Zoya Assistant • Client-Side PCM Audio Context
          </p>
        </div>
      </footer>
    </div>
  );
}
