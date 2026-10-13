"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, MoreHorizontal, Play, Timer } from "lucide-react";
import { mmss } from "./types";

function useElapsed(startedAt: string, pausedAt: string | null, pausedSec: number) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const tick = () => {
      const end = pausedAt ? new Date(pausedAt).getTime() : Date.now();
      setS(Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000) - pausedSec));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt, pausedAt, pausedSec]);
  return s;
}

/** Sticky header: back · name + clock · rest timer · Finish/Resume · menu. All targets ≥44px. */
export function ActiveWorkoutHeader({ name, startedAt, pausedAt, pausedSec, doneSets, totalSets, rest, paused, onBack, onDismissRest, onResume, onFinish, onMenu }: { name: string; startedAt: string; pausedAt: string | null; pausedSec: number; doneSets: number; totalSets: number; rest: { total: number; left: number } | null; paused: boolean; onBack: () => void; onDismissRest: () => void; onResume: () => void; onFinish: () => void; onMenu: () => void }) {
  const elapsed = useElapsed(startedAt, pausedAt, pausedSec);
  return (
    <>
      <header className="sticky top-0 z-30 -mx-4 flex items-center gap-2 border-b border-border/70 bg-bg/90 px-3 py-1.5 backdrop-blur" style={{ paddingTop: "calc(var(--safe-top) + 6px)" }}>
        <button onClick={onBack} aria-label="Back" className="press flex h-11 w-11 items-center justify-center rounded-full text-text-2">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="display truncate text-[15px] font-semibold">{name}</div>
          <div className="tabular text-[11px] text-muted">
            {mmss(elapsed)} · {doneSets}/{totalSets} sets{paused ? " · paused" : ""}
          </div>
        </div>
        {rest && !paused && (
          <button onClick={onDismissRest} className="press flex h-11 items-center gap-1.5 rounded-full border border-gold/50 bg-gold/10 px-3 text-sm text-gold" aria-label="Rest timer, tap to dismiss">
            <Timer size={14} /> <span className="tabular font-semibold">{mmss(rest.left)}</span>
          </button>
        )}
        {paused ? (
          <button onClick={onResume} className="press flex h-11 items-center gap-1.5 rounded-sm border border-success/50 bg-success/10 px-3 text-sm font-semibold text-success">
            <Play size={14} /> Resume
          </button>
        ) : (
          <button onClick={onFinish} className="press h-11 rounded-sm bg-gradient-to-b from-gold-2 to-gold px-4 text-sm font-semibold text-[#1a1406]" style={{ clipPath: "polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)" }}>
            Finish
          </button>
        )}
        <button onClick={onMenu} aria-label="Session options" className="press flex h-11 w-11 items-center justify-center rounded-full text-text-2">
          <MoreHorizontal size={20} />
        </button>
      </header>
      {rest && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-black/40">
          <div className="h-full bg-gold transition-[width] duration-1000 ease-linear" style={{ width: `${(rest.left / rest.total) * 100}%` }} />
        </div>
      )}
    </>
  );
}
