import { useEffect, useRef } from "react";
import { ConnectionState } from "../types";

interface VoiceReactorProps {
  state: ConnectionState;
  micAnalyser: AnalyserNode | null;
  speakerAnalyser: AnalyserNode | null;
  theme?: "indigo" | "rose";
}

export default function VoiceReactor({ state, micAnalyser, speakerAnalyser, theme = "indigo" }: VoiceReactorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high-DPI scaling
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height, 400); // Max size of reactor is 400px
      
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Buffers for analysers
    const micDataArray = micAnalyser ? new Uint8Array(micAnalyser.frequencyBinCount) : null;
    const speakerDataArray = speakerAnalyser ? new Uint8Array(speakerAnalyser.frequencyBinCount) : null;

    let particleAngle = 0;
    let waveAngle = 0;

    const draw = () => {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = width * 0.28;

      ctx.clearRect(0, 0, width, height);
      waveAngle += 0.04;

      // 1. DISCONNECTED / ERROR STATE VISUALIZER
      if (state === "disconnected" || state === "error") {
        const glowColor = state === "error" 
          ? "rgba(239, 68, 68, 0.4)" 
          : theme === "rose" 
          ? "rgba(244, 63, 94, 0.25)" 
          : "rgba(99, 102, 241, 0.25)";
        const ringColor = state === "error" 
          ? "rgb(239, 68, 68)" 
          : theme === "rose" 
          ? "rgb(244, 63, 94)" 
          : "rgb(99, 102, 241)";

        // Radial backdrop glow
        const gradient = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, baseRadius * 1.5);
        gradient.addColorStop(0, "rgba(15, 23, 42, 1)");
        gradient.addColorStop(0.6, glowColor);
        gradient.addColorStop(1, "rgba(15, 23, 42, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Single pulsing breathing circle
        const scale = 1 + Math.sin(waveAngle * 0.4) * 0.03;
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 15;
        ctx.shadowColor = ringColor;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * scale, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0; // reset
      }

      // 2. CONNECTING STATE (FAST SPINNING GLOW)
      else if (state === "connecting") {
        particleAngle += 0.08;

        // Radial backdrop glow (connecting cyan)
        const gradient = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, baseRadius * 1.6);
        gradient.addColorStop(0, "rgba(15, 23, 42, 1)");
        gradient.addColorStop(0.5, "rgba(6, 182, 212, 0.2)");
        gradient.addColorStop(1, "rgba(15, 23, 42, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Inner core
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.strokeStyle = "rgba(6, 182, 212, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Orbiting loaders
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;

        // Cyan ring segment
        ctx.strokeStyle = "#00f0ff";
        ctx.shadowColor = "#00f0ff";
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius + 4, particleAngle, particleAngle + Math.PI * 0.4);
        ctx.stroke();

        // Hot pink opposite segment
        ctx.strokeStyle = "#ff007f";
        ctx.shadowColor = "#ff007f";
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius + 4, particleAngle + Math.PI, particleAngle + Math.PI * 1.4);
        ctx.stroke();

        ctx.shadowBlur = 0; // reset
      }

      // 3. IDLE STATE (SMOOTH BREATHING HOLO-ORB)
      else if (state === "idle") {
        // Holographic radial backdrop
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 1.8);
        if (theme === "rose") {
          gradient.addColorStop(0, "rgba(244, 63, 94, 0.15)");
          gradient.addColorStop(0.4, "rgba(236, 72, 153, 0.1)");
        } else {
          gradient.addColorStop(0, "rgba(99, 102, 241, 0.15)");
          gradient.addColorStop(0.4, "rgba(139, 92, 246, 0.1)");
        }
        gradient.addColorStop(1, "rgba(15, 23, 42, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Dual sine ring overlays
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;

        // Outer neon violet/rose ring
        ctx.strokeStyle = theme === "rose" ? "rgba(244, 63, 94, 0.75)" : "rgba(139, 92, 246, 0.75)";
        ctx.shadowColor = theme === "rose" ? "#f43f5e" : "#8b5cf6";
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.05) {
          const r = baseRadius + Math.sin(a * 4 + waveAngle) * 4;
          const x = centerX + Math.cos(a) * r;
          const y = centerY + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Inner neon cyan/pink ring
        ctx.strokeStyle = theme === "rose" ? "rgba(236, 72, 153, 0.75)" : "rgba(6, 182, 212, 0.75)";
        ctx.shadowColor = theme === "rose" ? "#ec4899" : "#06b6d4";
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.05) {
          const r = baseRadius - 8 + Math.cos(a * 4 - waveAngle) * 3;
          const x = centerX + Math.cos(a) * r;
          const y = centerY + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.shadowBlur = 0; // reset
      }

      // 4. LISTENING STATE (USER SPEAKING)
      else if (state === "listening") {
        let averageFreq = 0;
        let pcmMax = 0;

        if (micAnalyser && micDataArray) {
          micAnalyser.getByteFrequencyData(micDataArray);
          // Calculate volume/average frequency
          let sum = 0;
          for (let i = 0; i < micDataArray.length; i++) {
            sum += micDataArray[i];
            if (micDataArray[i] > pcmMax) pcmMax = micDataArray[i];
          }
          averageFreq = sum / micDataArray.length;
        }

        const micBoost = averageFreq / 75; // dynamic boost factor
        const glowRadius = baseRadius * (1.3 + micBoost * 0.3);

        // Neon cyan core glow
        const gradient = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, glowRadius);
        gradient.addColorStop(0, "rgba(6, 182, 212, 0.25)");
        gradient.addColorStop(0.5, "rgba(6, 182, 212, 0.08)");
        gradient.addColorStop(1, "rgba(15, 23, 42, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Drawing frequency bars wrapping around the central orb
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#00f0ff";
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 1.5;

        const maxBars = 120;
        const step = (Math.PI * 2) / maxBars;

        ctx.beginPath();
        for (let i = 0; i < maxBars; i++) {
          const angle = i * step;
          const rawValue = micDataArray ? micDataArray[i % micDataArray.length] : 0;
          const barHeight = (rawValue / 255) * 45 + Math.sin(i * 0.15 + waveAngle) * 2;
          
          const startR = baseRadius - 3;
          const endR = baseRadius + barHeight;

          const startX = centerX + Math.cos(angle) * startR;
          const startY = centerY + Math.sin(angle) * startR;
          const endX = centerX + Math.cos(angle) * endR;
          const endY = centerY + Math.sin(angle) * endR;

          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
        }
        ctx.stroke();

        // Inner breathing orb
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.shadowBlur = 8;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(6, 182, 212, 0.5)";
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius - 10 + Math.sin(waveAngle * 0.8) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0; // reset
      }

      // 5. SPEAKING STATE (ZOYA TALKING)
      else if (state === "speaking") {
        let averageFreq = 0;
        let peakFreq = 0;

        if (speakerAnalyser && speakerDataArray) {
          speakerAnalyser.getByteFrequencyData(speakerDataArray);
          let sum = 0;
          for (let i = 0; i < speakerDataArray.length; i++) {
            sum += speakerDataArray[i];
            if (speakerDataArray[i] > peakFreq) peakFreq = speakerDataArray[i];
          }
          averageFreq = sum / speakerDataArray.length;
        }

        const speechStrength = averageFreq / 60; // 0 to ~2
        const peakStrength = peakFreq / 255;

        // Expansive electric hot-pink glow
        const glowRadius = baseRadius * (1.5 + speechStrength * 0.4);
        const gradient = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, glowRadius);
        gradient.addColorStop(0, "rgba(255, 0, 127, 0.3)");
        gradient.addColorStop(0.4, "rgba(189, 0, 255, 0.1)");
        gradient.addColorStop(1, "rgba(15, 23, 42, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw double wavy concentric loop
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#ff007f";
        ctx.strokeStyle = "#ff007f";
        ctx.lineWidth = 3;

        // Concentric loop 1 (Hot Pink)
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.04) {
          const bandIndex = Math.floor((a / (Math.PI * 2)) * (speakerDataArray?.length || 100));
          const freqVal = speakerDataArray ? speakerDataArray[bandIndex % speakerDataArray.length] : 0;
          const spike = (freqVal / 255) * 60 * (1 + Math.sin(a * 8 + waveAngle * 1.5) * 0.2);
          
          const r = baseRadius + spike;
          const x = centerX + Math.cos(a) * r;
          const y = centerY + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Concentric loop 2 (Purple)
        ctx.strokeStyle = "#bd00ff";
        ctx.shadowColor = "#bd00ff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.04) {
          const bandIndex = Math.floor(((a + Math.PI) / (Math.PI * 2)) * (speakerDataArray?.length || 100));
          const freqVal = speakerDataArray ? speakerDataArray[bandIndex % speakerDataArray.length] : 0;
          const spike = (freqVal / 255) * 45 * (1 + Math.cos(a * 10 - waveAngle * 2) * 0.15);
          
          const r = baseRadius - 10 + spike;
          const x = centerX + Math.cos(a) * r;
          const y = centerY + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Small yellow energy core pulsing to beat
        ctx.fillStyle = `rgba(255, 230, 0, ${0.4 + peakStrength * 0.4})`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#ffe600";
        ctx.beginPath();
        ctx.arc(centerX, centerY, (baseRadius * 0.4) * (1 + peakStrength * 0.25), 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state, micAnalyser, speakerAnalyser, theme]);

  return (
    <div className="relative w-full aspect-square flex items-center justify-center max-w-[340px] md:max-w-[380px]">
      <canvas ref={canvasRef} className="z-10 w-full h-full block" />
      {/* Outer abstract ring underlay */}
      <div className={`absolute rounded-full border border-dashed inset-0 m-auto aspect-square rounded-full transition-all duration-1000 ease-out pointer-events-none opacity-20 ${theme === 'rose' ? 'border-rose-500' : 'border-indigo-500'} scale-110 ${state === 'speaking' ? 'rotate-45 scale-125 border-pink-500 opacity-40' : state === 'listening' ? '-rotate-45 scale-115 border-cyan-500 opacity-40 animate-pulse' : 'animate-spin-[120s]'}`} />
      <div className={`absolute rounded-full border border-double inset-0 m-auto aspect-square rounded-full transition-all duration-1000 ease-out pointer-events-none opacity-10 ${theme === 'rose' ? 'border-pink-400' : 'border-indigo-400'} scale-125 ${state === 'speaking' ? '-rotate-12 scale-135 border-fuchsia-500' : 'animate-spin-[90s]'}`} />
    </div>
  );
}
