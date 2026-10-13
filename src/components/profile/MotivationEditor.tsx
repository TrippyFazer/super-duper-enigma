"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, Plus, X, Sparkles } from "lucide-react";
import { addReasonAction, deleteReasonAction, previewMorningMessageAction, updateReasonAction } from "@/actions/planner";
import { Button, cx, inputClass } from "@/components/ui/primitives";

export const REASON_SUGGESTIONS = ["I want to feel confident.", "I want more discipline.", "I want to look better.", "I want to have more energy.", "I want to become someone I am proud of."];

/** "Why I'm doing this" — the user's own words, used (sparingly) in morning messages. */
export function MotivationEditor({ reasons, compact }: { reasons: { id: number; text: string; active: boolean }[]; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const add = (t: string) => {
    if (!t.trim()) return;
    start(async () => {
      await addReasonAction(t);
      setText("");
      router.refresh();
    });
  };
  return (
    <section className={cx("plate space-y-3 px-4 py-3", compact && "")}>
      <div className="flex items-center gap-2">
        <Heart size={14} className="text-gold" />
        <div className="eyebrow">Why I&apos;m doing this</div>
      </div>
      {reasons.length === 0 && <p className="serif text-[13.5px] text-muted">Write it in your own words. Nobody else sees this. Morning messages will occasionally quote it back to you.</p>}
      <ul className="space-y-1.5">
        {reasons.map((r) => (
          <li key={r.id} className={cx("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", r.active ? "border-gold/30 bg-gold/5" : "border-border bg-card-2 text-muted")}>
            <span className="serif min-w-0 flex-1 text-[15px]">{r.text}</span>
            <button onClick={() => start(async () => { await updateReasonAction(r.id, { active: !r.active }); router.refresh(); })} className="press rounded-full border border-border px-2 py-0.5 text-[10px] text-text-2">
              {r.active ? "Active" : "Paused"}
            </button>
            <button aria-label="Remove" onClick={() => { if (window.confirm("Remove this reason?")) start(async () => { await deleteReasonAction(r.id); router.refresh(); }); }} className="press flex h-7 w-7 items-center justify-center rounded-full text-faint hover:text-danger">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="I want to…" className={inputClass} maxLength={160} onKeyDown={(e) => e.key === "Enter" && add(text)} />
        <Button variant="secondary" disabled={pending || !text.trim()} onClick={() => add(text)}>
          <Plus size={14} /> Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {REASON_SUGGESTIONS.filter((s) => !reasons.some((r) => r.text === s)).map((s) => (
          <button key={s} disabled={pending} onClick={() => add(s)} className="press rounded-full border border-border bg-card-2 px-2.5 py-1 text-[11.5px] text-text-2">
            {s}
          </button>
        ))}
      </div>
      {!compact && (
        <div>
          <button disabled={pending} onClick={() => start(async () => setPreview(await previewMorningMessageAction()))} className="press flex items-center gap-1 text-[11.5px] text-gold">
            <Sparkles size={11} /> Preview a morning message
          </button>
          {preview && <p className="serif mt-1 rounded-lg border border-border/60 bg-card-2 px-3 py-2 text-[14px] text-text">{preview}</p>}
        </div>
      )}
    </section>
  );
}
