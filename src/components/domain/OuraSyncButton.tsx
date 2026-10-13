"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncOuraAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";

export function OuraSyncButton({ days = 30 }: { days?: number }) {
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await syncOuraAction(days);
          toast(r.message, r.ok ? "quest" : "error");
        })
      }
      className="press flex items-center gap-1.5 rounded-full border border-border-strong bg-card-2 px-3 py-1.5 text-xs font-medium text-text-2 disabled:opacity-50"
    >
      <RefreshCw size={13} className={pending ? "animate-spin" : ""} /> {pending ? "Syncing" : "Sync"}
    </button>
  );
}
