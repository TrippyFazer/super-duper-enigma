"use client";

import { useState, useTransition } from "react";
import { Compass, MapPin } from "lucide-react";
import { saveHomeAreaAction } from "@/actions/adventure";
import { savePreferencesAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Card, Field, cx, inputClass } from "@/components/ui/primitives";
import { INTERESTS, type InterestLevel } from "@/events/types";

const LEVELS: InterestLevel[] = ["neutral", "interested", "love", "no"];
const LEVEL_LABEL: Record<InterestLevel, string> = { love: "Love it", interested: "Interested", neutral: "Neutral", no: "Not interested" };
const LEVEL_CLS: Record<InterestLevel, string> = { love: "border-gold/60 bg-gold/15 text-gold", interested: "border-success/50 bg-success/10 text-success", neutral: "border-border bg-card-2 text-text-2", no: "border-border bg-black/30 text-faint line-through" };

/** Home area + radius (no GPS), what sounds fun, cost preference. Setup is a few taps. */
export function AdventureCard({ location, adventure, sourcesConfigured }: { location: { query: string | null; city: string | null; region: string | null; lat: number | null; radiusMi: number }; adventure: { enabled: boolean; costPref: "free" | "under20" | "under50" | "any"; interests: Record<string, InterestLevel> }; sourcesConfigured: number }) {
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState(location.query ?? "");
  const [radius, setRadius] = useState(location.radiusMi);
  const [enabled, setEnabled] = useState(adventure.enabled);
  const [cost, setCost] = useState(adventure.costPref);
  const [interests, setInterests] = useState<Record<string, InterestLevel>>(adventure.interests);
  const cycle = (k: string) => {
    const cur = interests[k] ?? "neutral";
    const next = LEVELS[(LEVELS.indexOf(cur) + 1) % LEVELS.length];
    const nxt = { ...interests, [k]: next };
    setInterests(nxt);
    start(async () => { await savePreferencesAction({ adventure: { interests: nxt } }); });
  };
  const saveArea = () =>
    start(async () => {
      const r = await saveHomeAreaAction({ query, radiusMi: radius });
      toast(r.message, r.ok ? "quest" : "error");
    });
  const savePrefs = (patch: { enabled?: boolean; costPref?: typeof cost }) => start(async () => { await savePreferencesAction({ adventure: patch }); });

  return (
    <Card id="adventure" className="space-y-4">
      <div className="flex items-center gap-2">
        <Compass size={15} className="text-gold" />
        <div className="eyebrow">Adventure quests</div>
        <button onClick={() => { setEnabled(!enabled); savePrefs({ enabled: !enabled }); }} aria-pressed={enabled} className={cx("press ml-auto h-8 rounded-full border px-3 text-[11px]", enabled ? "border-success/50 bg-success/10 text-success" : "border-border text-muted")}>
          {enabled ? "On" : "Off"}
        </button>
      </div>
      <p className="text-xs text-muted">Real local events, occasionally offered as quests. Facts come from event sources; the AI only frames them. No GPS: a home area and a radius are enough.</p>
      <Field label="Home area" hint={location.city ? `Resolved: ${location.city}${location.region ? `, ${location.region}` : ""}` : "City and state, ZIP or region"}>
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Columbus, Ohio" className={inputClass} aria-label="Home area" />
          <Button variant="secondary" disabled={pending} onClick={saveArea}>
            <MapPin size={14} /> Save
          </Button>
        </div>
      </Field>
      <Field label="Quest radius" group>
        <div className="flex gap-1.5" role="group" aria-label="Radius">
          {[5, 10, 20, 30].map((r) => (
            <button key={r} onClick={() => { setRadius(r); start(async () => { await savePreferencesAction({ location: { radiusMi: r } }); }); }} aria-pressed={radius === r} className={cx("press h-10 flex-1 rounded-lg border text-sm", radius === r ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
              {r} mi
            </button>
          ))}
        </div>
      </Field>
      <Field label="Cost" group>
        <div className="flex gap-1.5" role="group" aria-label="Cost preference">
          {(
            [
              ["free", "Free only"],
              ["under20", "Under $20"],
              ["under50", "Under $50"],
              ["any", "Any"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => { setCost(k); savePrefs({ costPref: k }); }} aria-pressed={cost === k} className={cx("press h-10 flex-1 rounded-lg border text-[12px]", cost === k ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
              {l}
            </button>
          ))}
        </div>
      </Field>
      <Field label="What sounds fun" hint="Tap to cycle: neutral → interested → love it → not interested. Improves with what you accept, decline and rate." group>
        <div className="flex flex-wrap gap-1.5">
          {INTERESTS.map((i) => {
            const lvl = interests[i.key] ?? "neutral";
            return (
              <button key={i.key} onClick={() => cycle(i.key)} aria-label={`${i.label}: ${LEVEL_LABEL[lvl]}`} className={cx("press h-10 rounded-full border px-3 text-xs", LEVEL_CLS[lvl])}>
                {i.label}
                {lvl === "love" ? " ♥" : lvl === "interested" ? " +" : ""}
              </button>
            );
          })}
        </div>
      </Field>
      <p className="text-[11px] text-faint">{sourcesConfigured ? `${sourcesConfigured} event source${sourcesConfigured === 1 ? "" : "s"} configured.` : "No event source configured yet. Add TICKETMASTER_API_KEY or EVENT_ICS_URLS to .env.local; curated quests keep working without it."}</p>
    </Card>
  );
}
