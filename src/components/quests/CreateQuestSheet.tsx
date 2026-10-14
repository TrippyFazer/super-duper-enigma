"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createQuestAction } from "@/actions/adventure";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, cx, inputClass } from "@/components/ui/primitives";

/** CREATE QUEST: your own to-do as an accepted quest. Optional AI enhance; ordinary things stay ordinary. */
export function CreateQuestSheet({ open, onClose, aiEnabled }: { open: boolean; onClose: () => void; aiEnabled: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [title, setTitle] = useState("");
  const [enhance, setEnhance] = useState(aiEnabled);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await createQuestAction({ title, enhance });
      if (!r.ok) return toast(r.error ?? "Could not create", "error");
      toast("Quest added", "quest", `${r.title} · +${r.xp} XP`);
      setTitle("");
      onClose();
      router.refresh();
    });
  return (
    <Sheet open={open} onClose={onClose} title="Create a quest">
      <div className="space-y-3 pb-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Go grocery shopping today" className={inputClass} autoFocus maxLength={80} aria-label="Quest" onKeyDown={(e) => e.key === "Enter" && title.trim().length >= 3 && submit()} />
        {aiEnabled && (
          <button onClick={() => setEnhance((v) => !v)} aria-pressed={enhance} className={cx("press flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm", enhance ? "border-gold/50 bg-gold/10 text-gold" : "border-border bg-card-2 text-text-2")}>
            <Sparkles size={14} /> AI enhance
            <span className="ml-auto text-[11px] text-muted">{enhance ? "adds a title and a target" : "keep my words"}</span>
          </button>
        )}
        <Button full size="lg" variant="gold" disabled={pending || title.trim().length < 3} onClick={submit}>
          {pending ? "Adding…" : "Add quest"}
        </Button>
        <p className="serif text-[12.5px] text-muted">Accepted immediately. 15–60 XP by effort; expires tomorrow night, no penalty.</p>
      </div>
    </Sheet>
  );
}
