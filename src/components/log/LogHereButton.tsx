"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { LogSheet, type LogKind } from "./LogSheet";

/** Inline "+ Log …" button for domain pages. Opens the same global sheet at the right place. */
export function LogHereButton({ kind, label }: { kind: LogKind; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 text-sm font-semibold text-gold">
        <Plus size={16} /> {label}
      </button>
      <LogSheet open={open} onClose={() => setOpen(false)} initial={kind} />
    </>
  );
}
