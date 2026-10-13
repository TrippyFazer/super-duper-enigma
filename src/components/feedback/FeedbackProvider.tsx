"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, Trophy, ArrowUpRight, Zap } from "lucide-react";
import type { ActionFeedback } from "@/actions";

interface Toast {
  id: number;
  kind: "xp" | "quest" | "error";
  text: string;
  sub?: string;
}

interface Celebration {
  id: number;
  kind: "level" | "rank" | "achievement";
  title: string;
  body: string;
  accent: "gold" | "accent" | "violet";
}

interface FeedbackApi {
  notify: (f: ActionFeedback) => void;
  toast: (text: string, kind?: Toast["kind"], sub?: string) => void;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFeedback outside FeedbackProvider");
  return c;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [queue, setQueue] = useState<Celebration[]>([]);
  const idRef = useRef(1);

  const toast = useCallback((text: string, kind: Toast["kind"] = "xp", sub?: string) => {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, kind, text, sub }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const notify = useCallback(
    (f: ActionFeedback) => {
      if (!f.ok) {
        toast(f.error ?? "Something went wrong", "error");
        return;
      }
      if (f.xpGained > 0) toast(`+${f.xpGained} XP`, "xp", f.xpLines.slice(0, 2).join(" · "));
      for (const q of f.questsCompleted) toast(`Quest complete`, "quest", `${q.title} · +${q.rewardXp} XP`);
      const cs: Celebration[] = [];
      if (f.levelUp) cs.push({ id: idRef.current++, kind: "level", title: `Level ${f.levelUp.to}`, body: `Up from level ${f.levelUp.from}. Keep climbing.`, accent: "accent" });
      for (const r of f.rankUps) {
        const name = r.domain === "overall" ? "Overall rank" : r.domain[0].toUpperCase() + r.domain.slice(1);
        cs.push({ id: idRef.current++, kind: "rank", title: `${name}: ${r.to}`, body: r.from ? `Promoted from ${r.from} rank.` : `Your first ${r.to} rank.`, accent: r.to === "S" ? "gold" : "violet" });
      }
      for (const a of f.achievements) cs.push({ id: idRef.current++, kind: "achievement", title: a.name, body: a.title ? `Achievement unlocked · Title: “${a.title}”` : "Achievement unlocked", accent: "gold" });
      if (cs.length) setQueue((q) => [...q, ...cs]);
    },
    [toast],
  );

  const api = useMemo(() => ({ notify, toast }), [notify, toast]);
  const current = queue[0];
  const dismiss = () => setQueue((q) => q.slice(1));

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(dismiss, 3800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4" style={{ top: "calc(var(--safe-top) + 12px)" }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className={`pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-full border px-4 py-2 text-sm shadow-xl backdrop-blur-xl ${
                t.kind === "error" ? "border-danger/40 bg-danger/15 text-danger" : t.kind === "quest" ? "border-accent/40 bg-surface/95 text-text" : "border-gold/40 bg-surface/95 text-text"
              }`}
            >
              {t.kind === "xp" ? <Zap size={16} className="text-gold" /> : t.kind === "quest" ? <Sparkles size={16} className="text-accent-2" /> : null}
              <span className="tabular font-semibold">{t.text}</span>
              {t.sub && <span className="truncate text-xs text-muted">{t.sub}</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Celebrations */}
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            className="fixed inset-0 z-[70] flex items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.8, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className={`relative w-full max-w-sm rounded-3xl border bg-card p-7 text-center ${
                current.accent === "gold" ? "border-gold/50 rank-glow-s" : current.accent === "violet" ? "border-violet/50 shadow-[0_0_40px_-10px_rgba(176,140,245,0.6)]" : "border-accent/50 shadow-[var(--shadow-glow-accent)]"
              }`}
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-black/40">
                {current.kind === "level" ? (
                  <ArrowUpRight size={30} className="text-accent-2" />
                ) : current.kind === "rank" ? (
                  <Sparkles size={30} className={current.accent === "gold" ? "text-gold" : "text-violet"} />
                ) : (
                  <Trophy size={30} className="text-gold" />
                )}
              </div>
              <div className="eyebrow">{current.kind === "level" ? "Level up" : current.kind === "rank" ? "Rank up" : "Achievement"}</div>
              <div className={`display mt-1 text-3xl font-semibold ${current.accent === "gold" ? "text-gradient-gold" : ""}`}>{current.title}</div>
              <p className="mt-2 text-sm text-text-2">{current.body}</p>
              <p className="mt-5 text-[11px] text-faint">Tap to continue</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
