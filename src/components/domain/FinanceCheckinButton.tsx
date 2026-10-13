"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { FinanceSheet } from "@/components/log/FinanceSheet";

export function FinanceCheckinButton({ today, prefill }: { today: string; prefill: Parameters<typeof FinanceSheet>[0]["prefill"] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="press flex w-full items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold">
        <Coins size={16} /> {prefill ? "Monthly check-in" : "First financial check-in"}
      </button>
      <FinanceSheet open={open} onClose={() => setOpen(false)} date={today} prefill={prefill} />
    </>
  );
}
