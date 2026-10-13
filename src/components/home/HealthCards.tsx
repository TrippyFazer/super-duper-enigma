"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Footprints, Moon, Swords } from "lucide-react";
import { offerStepQuestAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { cx } from "@/components/ui/primitives";

export interface HealthCardsProps {
  steps: number | null;
  stepsTarget: number;
  stepsSource: string | null;
  lastNight: { totalSleepMin: number; bedtimeStart: string | null; bedtimeEnd: string | null; source: string } | null;
  sleepTargetMin: number;
  plannedBed: string | null; // "23:15"
  plannedWake: string | null; // "07:30"
  consistency: "Good" | "Fair" | "Off" | null;
  /** show the evening-walk offer: steps short by this many */
  walkOffer: { remaining: number; xp: number } | null;
  hasWalkQuest: boolean;
}

const fmt = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
const clock = (iso: string | null) => (iso ? iso.slice(11, 16) : null);
const to12 = (hhmm: string | null) => {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

/** Today's steps and last night, driven by whatever data exists (Apple Health, Oura, or manual). */
export function HealthCards(p: HealthCardsProps) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [pending, start] = useTransition();
  const [offered, setOffered] = useState(false);
  if (p.steps == null && !p.lastNight) return null;
  const pct = p.steps != null ? Math.min(1, p.steps / Math.max(1, p.stepsTarget)) : 0;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {p.steps != null && (
        <div className="plate px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
            <Footprints size={11} /> Today
          </div>
          <div className="tabular display mt-1 text-xl font-semibold">
            {p.steps.toLocaleString()}
            <span className="text-sm text-muted"> / {p.stepsTarget.toLocaleString()}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/40">
            <div className={cx("h-full rounded-full", pct >= 1 ? "bg-success" : "bg-gold")} style={{ width: `${pct * 100}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-faint">{p.stepsSource === "health" || p.stepsSource === "Apple Health" ? "Apple Health" : (p.stepsSource ?? "")}</div>
          {p.walkOffer && !p.hasWalkQuest && !offered && (
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await offerStepQuestAction();
                  notify(r);
                  setOffered(true);
                  router.refresh();
                })
              }
              className="press mt-2 flex w-full items-center justify-center gap-1 rounded-sm border border-gold/50 bg-gold/10 px-2 py-1.5 text-[11px] font-medium text-gold"
            >
              <Swords size={11} /> {p.walkOffer.remaining.toLocaleString()} left · walk quest +{p.walkOffer.xp}
            </button>
          )}
        </div>
      )}
      {p.lastNight && (
        <Link href="/domains/sleep" className="plate press px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
            <Moon size={11} /> Last night
          </div>
          <div className="tabular display mt-1 text-xl font-semibold">
            {fmt(p.lastNight.totalSleepMin)}
            <span className="text-sm text-muted"> / {fmt(p.sleepTargetMin)}</span>
          </div>
          <div className="mt-1 text-[11px] text-text-2">
            {clock(p.lastNight.bedtimeStart) ? `Bed ${to12(clock(p.lastNight.bedtimeStart))}` : ""}
            {clock(p.lastNight.bedtimeEnd) ? ` · Wake ${to12(clock(p.lastNight.bedtimeEnd))}` : ""}
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[10px] text-faint">
            <span>{p.lastNight.source === "health" ? "Apple Health" : p.lastNight.source}</span>
            {p.consistency && <span className={cx(p.consistency === "Good" ? "text-success" : p.consistency === "Fair" ? "text-warn" : "text-muted")}>Consistency: {p.consistency}</span>}
          </div>
        </Link>
      )}
    </div>
  );
}
