"use client";

import { cx } from "@/components/ui/primitives";

export function StepTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="px-1">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="display mt-0.5 text-[20px] font-semibold leading-tight">{title}</h2>
      <p className="serif mt-1 text-[13.5px] text-muted">{body}</p>
    </div>
  );
}

export function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ok" | "warn" }) {
  return (
    <div className="plate px-3 py-2.5 text-center">
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("tabular display text-lg font-semibold", tone === "warn" && "text-warn")}>{value}</div>
      <div className="text-[10px] text-muted">{sub}</div>
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cx("press h-10 rounded-full border px-3 text-xs", on ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
      {children}
    </button>
  );
}
