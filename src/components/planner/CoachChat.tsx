"use client";

import { useState, useTransition } from "react";
import { Send, Sparkles } from "lucide-react";
import { askCoachAction } from "@/actions/planner";
import { cx, inputClass } from "@/components/ui/primitives";

interface Msg {
  role: "user" | "coach";
  text: string;
  suggestions?: string[];
  source?: string;
}

const PROMPTS = ["What should I do today?", "Build me a 45-minute workout", "What can I cook with chicken and rice?", "Why isn't my fitness rank increasing?", "Easiest way to gain XP tonight?", "Adjust today's workout, I'm tired", "Give me a high-protein dinner"];

export function CoachChat({ name }: { name: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "coach", text: `Ready, ${name}. Ask about today's plan, training, meals, or why a rank is where it is.` }]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();

  const ask = (q: string) => {
    if (!q.trim()) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    start(async () => {
      try {
        const r = await askCoachAction(q);
        setMsgs((m) => [...m, { role: "coach", text: r.reply, suggestions: r.suggestions, source: r.source }]);
      } catch (e) {
        setMsgs((m) => [...m, { role: "coach", text: `Something went wrong: ${(e as Error).message}` }]);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        {msgs.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[88%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed", m.role === "user" ? "bg-accent/20 text-text" : "plate serif text-[15.5px] text-text")}>
              {m.role === "coach" && (
                <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-gold">
                  <Sparkles size={10} /> Coach{m.source === "rules" ? " · rules" : m.source === "ai" ? " · AI" : ""}
                </div>
              )}
              {m.text}
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.suggestions.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="press rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-sans text-[11.5px] text-gold">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && <div className="animate-pulse-soft px-2 text-xs text-muted">Thinking…</div>}
      </div>
      <div className="scroll-x -mx-4 flex gap-1.5 px-4">
        {PROMPTS.map((p) => (
          <button key={p} onClick={() => ask(p)} disabled={pending} className="press shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-text-2">
            {p}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the coach" className={inputClass} maxLength={500} />
        <button type="submit" disabled={pending || !input.trim()} aria-label="Send" className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-gold-2 to-gold text-[#1a1406] disabled:opacity-50">
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
