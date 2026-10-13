"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { uncompleteOfferAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";

/** Undo a special-quest completion made by mistake (only offered for today's completions). */
export function UndoOfferButton({ id }: { id: number }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        start(async () => {
          await uncompleteOfferAction(id);
          toast("Completion undone · XP reversed", "quest");
          router.refresh();
        });
      }}
      className="press flex h-10 items-center gap-1 rounded-full border border-border px-3 text-[11px] text-text-2 disabled:opacity-50"
    >
      <Undo2 size={11} /> Undo
    </button>
  );
}
