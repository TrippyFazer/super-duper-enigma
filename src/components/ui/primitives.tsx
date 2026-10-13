import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export function Card({ children, className, glow, id }: { children: ReactNode; className?: string; glow?: "gold" | "accent" | null; id?: string }) {
  return (
    <section id={id} className={cx("card p-4", glow === "gold" && "rank-glow-s", glow === "accent" && "shadow-[var(--shadow-glow-accent)]", className)}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-2 flex items-end justify-between px-1", className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "gold",
  className,
  height = "h-2",
}: {
  value: number; // 0..1
  tone?: "gold" | "accent" | "success" | "muted" | "violet";
  className?: string;
  height?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const bar =
    tone === "gold"
      ? "bg-gradient-to-r from-gold-dim via-gold to-gold-2"
      : tone === "accent"
        ? "bg-gradient-to-r from-accent/70 to-accent-2"
        : tone === "success"
          ? "bg-success"
          : tone === "violet"
            ? "bg-gradient-to-r from-violet/70 to-violet"
            : "bg-faint";
  return (
    <div className={cx("w-full overflow-hidden rounded-full bg-black/40", height, className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-[width] duration-700 ease-out", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Pill({ children, tone = "muted", className }: { children: ReactNode; tone?: "muted" | "gold" | "accent" | "success" | "danger" | "violet"; className?: string }) {
  const t =
    tone === "gold"
      ? "bg-gold/12 text-gold border-gold/25"
      : tone === "accent"
        ? "bg-accent/12 text-accent-2 border-accent/25"
        : tone === "success"
          ? "bg-success/12 text-success border-success/25"
          : tone === "danger"
            ? "bg-danger/12 text-danger border-danger/25"
            : tone === "violet"
              ? "bg-violet/12 text-violet border-violet/25"
              : "bg-white/5 text-text-2 border-border";
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", t, className)}>{children}</span>;
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  disabled,
  className,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  full?: boolean;
}) {
  const v =
    variant === "primary"
      ? "bg-accent text-white hover:bg-accent-2 disabled:bg-accent/50"
      : variant === "gold"
        ? "bg-gradient-to-b from-gold-2 to-gold text-[#1a1406] font-semibold hover:brightness-105"
        : variant === "secondary"
          ? "bg-card-2 text-text border border-border-strong hover:bg-white/5"
          : variant === "danger"
            ? "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25"
            : "bg-transparent text-text-2 hover:bg-white/5";
  const s = size === "sm" ? "h-9 px-3 text-sm" : size === "lg" ? "h-13 px-5 text-base" : "h-11 px-4 text-sm";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cx("press inline-flex items-center justify-center gap-2 rounded-xl font-medium disabled:opacity-60", v, s, full && "w-full", className)}>
      {children}
    </button>
  );
}

export function LinkRow({ href, title, subtitle, left, right }: { href: string; title: ReactNode; subtitle?: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <Link href={href} className="press flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-white/[0.03]">
      {left}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
      </div>
      {right}
      <ChevronRight size={18} className="text-faint" />
    </Link>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <div className="text-base font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A labelled control. Use `group` when the children are a row of buttons rather than a single input. */
export function Field({ label, hint, children, className, group }: { label: string; hint?: string; children: ReactNode; className?: string; group?: boolean }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className={cx("block", className)} {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="mb-1.5 block text-xs font-medium text-text-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </Tag>
  );
}

export const inputClass =
  "w-full rounded-xl border border-border-strong bg-black/30 px-3.5 py-3 text-[15px] text-text placeholder:text-faint outline-none focus:border-accent/70 focus:ring-2 focus:ring-accent/20";

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx("flex rounded-xl border border-border bg-black/30 p-1", className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx("press flex-1 rounded-lg px-2 py-2 text-sm font-medium", active ? "bg-card-2 text-text shadow" : "text-muted")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("card-2 px-3.5 py-3", className)}>
      <div className="eyebrow">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Trend({ delta, suffix = "" }: { delta: number | null | undefined; suffix?: string }) {
  if (delta == null || Math.abs(delta) < 0.05) return <span className="text-xs text-faint">—</span>;
  const up = delta > 0;
  return (
    <span className={cx("tabular text-xs font-medium", up ? "text-success" : "text-danger")}>
      {up ? "↑" : "↓"} {Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}
      {suffix}
    </span>
  );
}

export function PageHeader({ title, subtitle, back, right }: { title: ReactNode; subtitle?: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="mb-4 flex items-start gap-3">
      {back && (
        <Link href={back} aria-label="Back" className="press mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text-2">
          <ChevronRight size={18} className="rotate-180" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="display text-2xl font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
