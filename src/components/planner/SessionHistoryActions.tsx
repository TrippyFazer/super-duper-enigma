"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { discardSessionAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";

/** Discard a session from history. Confirms, voids its XP, removes it entirely. */
export function DiscardSessionButton({ id, label = "Discard session", status, setCount }: { id: number; label?: string; status: string; setCount: number }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const msg = status === "completed" ? `Discard this session? Its workout log, ${setCount} sets and any XP or records it earned will be removed. It will not count toward progress.` : "Discard this session? It will not count toward progress.";
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!window.confirm(msg)) return;
        start(async () => {
          const r = await discardSessionAction(id);
          toast(r.voidedXp ? `Session discarded · ${r.voidedXp} XP reversed` : "Session discarded", "quest");
          router.refresh();
        });
      }}
      className="press flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-text-2 hover:border-danger/50 hover:text-danger disabled:opacity-50"
    >
      <Trash2 size={12} /> {label}
    </button>
  );
}
