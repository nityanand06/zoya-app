import { ExternalLink, Globe, HardDriveDownload } from "lucide-react";
import { ToolCallLog } from "../types";

interface LogsPanelProps {
  logs: ToolCallLog[];
  onOpenUrl: (url: string) => void;
}

export default function LogsPanel({ logs, onOpenUrl }: LogsPanelProps) {
  return (
    <div className="w-full bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-4 md:p-5 shadow-2xl transition-all duration-300">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/85">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400 animate-pulse" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 font-sans uppercase">
            Holographic Browser Proxy
          </h2>
        </div>
        <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded-full uppercase">
          zoya.terminal v1.0
        </span>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center text-slate-500 font-mono text-xs">
          <div className="relative w-8 h-8 rounded-full border border-slate-800 flex items-center justify-center mb-2 animate-pulse">
            <Globe className="w-4 h-4 text-slate-600" />
          </div>
          <span>Terminal idle. Speak to Zoya to request website searches or page opens.</span>
        </div>
      ) : (
        <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between gap-3 bg-slate-950/80 border border-cyan-950 px-3 py-2 rounded-xl hover:border-cyan-500/50 hover:bg-slate-950 transition-all duration-300 group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/50 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                  <ExternalLink className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-mono text-cyan-400 truncate tracking-wide">
                    {log.name}()
                  </p>
                  <p className="text-[11px] text-slate-400 truncate font-mono">
                    {log.args.url}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] text-slate-500 font-mono hidden sm:inline">
                  {log.timestamp}
                </span>
                <button
                  onClick={() => onOpenUrl(log.args.url)}
                  className="bg-cyan-950 border border-cyan-800 text-cyan-400 px-2 py-1 rounded text-[10px] font-mono font-medium flex items-center gap-1 hover:bg-cyan-400 hover:text-slate-950 transition-colors cursor-pointer"
                >
                  Go <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
