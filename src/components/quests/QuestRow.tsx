import Link from "next/link";
import { Check, ChevronRight, Dumbbell, Moon, UtensilsCrossed, Coins, Droplets, ShieldCheck, Flame, Sparkles, Footprints } from "lucide-react";
import { cx, ProgressBar } from "@/components/ui/primitives";

const ICONS: Record<string, typeof Dumbbell> = { fitness: Dumbbell, sleep: Moon, cooking: UtensilsCrossed, wealth: Coins, skincare: Droplets, sobriety: ShieldCheck, habits: Flame, overall: Sparkles, steps: Footprints };

export interface QuestRowProps {
  title: string;
  subtitle?: string;
  domain: string;
  done?: boolean;
  progress?: number; // 0..1
  progressLabel?: string;
  rewardXp?: number;
  href?: string;
  onToggle?: () => void;
  tone?: "default" | "special" | "boss";
}

/** Knight-plate quest row: icon tile, title, flavour line, status ring, reward. */
export function QuestRow(p: QuestRowProps) {
  const Icon = ICONS[p.domain] ?? Sparkles;
  const inner = (
    <>
      <span className={cx("plate-tile flex h-12 w-12 shrink-0 items-center justify-center", p.tone === "boss" && "border-violet/40")}>
        <Icon size={20} className={p.done ? "text-success" : p.tone === "special" ? "text-gold" : "text-text-2"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("line-clamp-2 text-[15px] font-medium leading-snug", p.done && "text-muted line-through decoration-faint")}>{p.title}</span>
        {p.subtitle && <span className="serif block truncate text-[13.5px] text-muted">{p.subtitle}</span>}
        {p.progress != null && !p.done && p.progress > 0 && (
          <span className="mt-1.5 flex items-center gap-2">
            <ProgressBar value={p.progress} tone={p.tone === "boss" ? "violet" : "accent"} height="h-1" className="max-w-[140px]" />
            {p.progressLabel && <span className="tabular text-[10px] text-muted">{p.progressLabel}</span>}
          </span>
        )}
      </span>
      {p.rewardXp != null && <span className="tabular shrink-0 text-xs font-semibold text-gold">+{p.rewardXp}</span>}
      {p.onToggle ? (
        <span className={cx("ring-circle flex shrink-0 items-center justify-center transition-colors", p.done && "border-success bg-success text-[#071a10]")}>{p.done && <Check size={14} strokeWidth={3} />}</span>
      ) : (
        <span className={cx("ring-circle flex shrink-0 items-center justify-center", p.done && "border-success bg-success text-[#071a10]")}>{p.done && <Check size={14} strokeWidth={3} />}</span>
      )}
      {p.href && !p.onToggle && <ChevronRight size={16} className="shrink-0 text-faint" />}
    </>
  );
  const cls = "press flex w-full items-center gap-3 px-3 py-2.5 text-left";
  if (p.onToggle) {
    return (
      <button type="button" onClick={p.onToggle} aria-pressed={!!p.done} className={cls}>
        {inner}
      </button>
    );
  }
  if (p.href) {
    return (
      <Link href={p.href} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
