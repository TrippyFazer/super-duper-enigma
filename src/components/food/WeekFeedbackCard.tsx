import { Leaf } from "lucide-react";
import type { WeekFeedback } from "@/services/foodWeek";
import { cx } from "@/components/ui/primitives";

const money = (n: number | null) => (n == null ? "—" : `$${n.toFixed(0)}`);

/** Light, honest feedback for a week of food: spend vs budget, reuse, leftovers, meals cooked, eating out. */
export function WeekFeedbackCard({ fb, title = "This week" }: { fb: WeekFeedback; title?: string }) {
  const under = fb.actual != null && fb.actual <= fb.budget;
  const rows: [string, string, string?][] = [
    ["Grocery spending", fb.actual != null ? money(fb.actual) : `~${money(fb.estimated)} est.`, fb.actual != null ? (under ? "text-success" : "text-warn") : "text-muted"],
    ["Budget", money(fb.budget)],
    ["Ingredients reused", fb.reusePct != null ? `${fb.reusePct}%` : "—"],
    ["Leftovers carried forward", fb.leftoversCarried != null ? `${fb.leftoversCarried} item${fb.leftoversCarried === 1 ? "" : "s"}` : "—"],
    ["Meals cooked", String(fb.mealsCooked)],
    ["Eating out", String(fb.eatingOut)],
    ["Planned meals eaten", fb.plannedTotal ? `${fb.plannedEaten} / ${fb.plannedTotal}` : "—"],
  ];
  return (
    <section className="plate px-4 py-3">
      <div className="flex items-center gap-2">
        <Leaf size={14} className="text-success" />
        <div className="eyebrow">{title}</div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
        {rows.map(([k, v, c]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1">
            <dt className="text-muted">{k}</dt>
            <dd className={cx("tabular font-medium", c)}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="serif mt-2 text-[12px] text-faint">Rough numbers on purpose. Planning and consistency are what earn XP here — not spending less at all costs.</p>
    </section>
  );
}
