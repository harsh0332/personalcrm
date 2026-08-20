"use client";

import { AlertTriangle, ExternalLink, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DatabaseConnectionAlertProps {
  errorMsg: string;
  onRetry: () => void;
  retrying?: boolean;
}

export function isDatabasePausedError(msg: string): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes("503") ||
    lower.includes("service unavailable") ||
    lower.includes("paused") ||
    lower.includes("500") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror")
  );
}

export function DatabaseConnectionAlert({
  errorMsg,
  onRetry,
  retrying = false,
}: DatabaseConnectionAlertProps) {
  const projectRef =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "").split(".")[0] ||
    "sfvejlxbjgcrrmpgkanh";
  const isPausedCandidate = isDatabasePausedError(errorMsg);

  return (
    <div className="p-4 bg-zinc-900 border border-amber-800/80 rounded-2xl space-y-4 shadow-xl text-zinc-100 max-w-md mx-auto w-full my-4">
      <div className="flex items-center space-x-3">
        <div className="p-3 bg-amber-950 border border-amber-800 rounded-full text-amber-400 shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-sm font-extrabold text-amber-200 uppercase tracking-wide">
            Database Connection Alert
          </h2>
          <span className="text-[10px] font-mono text-zinc-400">
            Project: <code className="text-emerald-400 font-bold">{projectRef}</code> (CallDesk CRM)
          </span>
        </div>
      </div>

      <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-xs space-y-2 leading-relaxed">
        <p className="font-semibold text-zinc-200">
          {isPausedCandidate
            ? "Your Supabase Database may be PAUSED or unreachable."
            : "Database query error encountered."}
        </p>

        <p className="text-zinc-400 text-[11px]">
          Supabase free tier automatically pauses database projects after 7 days of zero activity. When paused, calls and data queries cannot be processed.
        </p>

        <div className="p-2 bg-amber-950/40 rounded border border-amber-900/60 font-mono text-[11px] text-amber-300 break-words">
          Error: {errorMsg}
        </div>
      </div>

      {/* ACTION GUIDANCE */}
      <div className="space-y-2 text-xs">
        <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 block">
          How to Resolve Right Now:
        </span>
        <ol className="list-decimal list-inside space-y-1.5 text-zinc-300 text-[11px] leading-relaxed">
          <li>
            Open the <strong className="text-emerald-300">Supabase Dashboard</strong> to unpause/restore project <code className="text-emerald-400">{projectRef}</code>.
          </li>
          <li>
            If you are on patchy mobile data, check internet connection and tap <strong>Retry Connection</strong> below.
          </li>
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <a
          href="https://supabase.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full h-10 bg-amber-700 hover:bg-amber-600 text-amber-950 font-bold text-xs rounded-xl flex items-center justify-center space-x-1 transition-colors"
        >
          <span>Open Dashboard</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        <Button
          onClick={onRetry}
          disabled={retrying}
          className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs rounded-xl flex items-center justify-center space-x-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`} />
          <span>Retry Connection</span>
        </Button>
      </div>
    </div>
  );
}
