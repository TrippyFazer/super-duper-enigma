"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Swords, Clock, Zap, MapPin, CalendarDays, ExternalLink, Compass } from "lucide-react";
import { acceptOfferAction, completeOfferAction, declineOfferAction } from "@/actions/planner";
import { adventureOutcomeAction, followUpAction, rateAdventureAction } from "@/actions/adventure";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, cx, inputClass } from "@/components/ui/primitives";
import type { OfferView } from "./offerView";

export type { OfferView } from "./offerView";

const KIND_LABEL: Record<string, string> = { special: "Special quest", side: "Side quest", recovery: "Recovery quest", social: "Social quest", discipline: "Discipline quest", bonus: "Bonus quest", adventure: "Adventure quest", discovery: "Discovery quest", custom: "Your quest" };
const DIFF_TONE: Record<string, string> = { common: "text-text-2", uncommon: "text-success", rare: "text-accent-2", epic: "text-violet", legendary: "text-gold" };

function useCountdown(expiresAt: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(new Date(expiresAt).getTime() - Date.now());
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return left;
}

export function expiryLabel(ms: number | null): string {
  if (ms == null) return "";
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return `${Math.round(h / 24)}d left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export function whenLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86_400_000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${sameDay ? "Tonight" : tomorrow ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

/** The NPC-style optional quest card. Adventure quests carry verified event facts and a source link. */
export function SpecialQuestCard({ offer, compact }: { offer: OfferView; compact?: boolean }) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [asking, setAsking] = useState<"went" | "rate" | "follow" | null>(null);
  const [ingredient, setIngredient] = useState("");
  const left = useCountdown(offer.expiresAt);
  if (gone) return null;
  const accepted = offer.status === "accepted";
  const isEvent = !!offer.startAt;
  const Icon = isEvent ? Compass : Swords;

  const finishAdventure = (went: boolean) =>
    start(async () => {
      const r = await adventureOutcomeAction(offer.id, went);
      if (!went) {
        setAsking(null);
        setGone(true);
        toast("Not this time", "quest", "No penalty. More adventures will appear.");
        return;
      }
      notify(r);
      if (r.ok) setAsking("rate");
      else setAsking(null);
    });

  return (
    <section className={cx("plate overflow-hidden", accepted ? "border-gold/50" : "")} style={{ boxShadow: "0 0 0 1px rgba(212,175,90,0.15), 0 10px 30px -14px rgba(212,175,90,0.35)" }}>
      <div className="relative px-4 pt-3 pb-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-gold" />
            <span className="eyebrow text-gold">{isEvent ? "An adventure appeared" : (KIND_LABEL[offer.kind] ?? "Special quest")}</span>
          </div>
          <span className="rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">{accepted ? "Active" : "Optional"}</span>
        </div>
        <div className="gold-rule my-2.5" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="display text-[17px] font-semibold leading-snug">{offer.title}</div>
            {isEvent && offer.eventName && offer.eventName !== offer.title && <div className="text-[13px] text-text-2">{offer.eventName}</div>}
            {offer.description && <div className="serif mt-0.5 text-[14.5px] text-text-2">{offer.description}</div>}
            {isEvent && (
              <div className="mt-2 space-y-0.5 text-[12.5px] text-text-2">
                <div className="flex items-center gap-1.5">
                  <CalendarDays size={12} className="text-muted" /> {whenLabel(offer.startAt)}
                </div>
                {(offer.venue || offer.distanceMi != null) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-muted" /> {offer.venue ?? ""}
                    {offer.distanceMi != null ? ` · ${offer.distanceMi} mi` : ""}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className={cx("rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider", offer.priceLabel === "Free" ? "bg-success/15 text-success" : "bg-white/5 text-muted")}>{offer.priceLabel ?? "Price not listed"}</span>
                  {offer.sourceName && <span className="text-[11px] text-faint">via {offer.sourceName}</span>}
                </div>
                {offer.why && <div className="serif text-[12.5px] italic text-muted">{offer.why}</div>}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
              <span className="inline-flex items-center gap-1 text-gold">
                <Zap size={12} /> +{offer.xpReward} XP
              </span>
              <span className={cx("capitalize", DIFF_TONE[offer.difficulty])}>{offer.difficulty}</span>
              {!isEvent && offer.estimatedMinutes > 0 && <span>~{offer.estimatedMinutes} min</span>}
              {offer.expiresAt && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} /> {expiryLabel(left)}
                </span>
              )}
              {isEvent && offer.sourceUrl && (
                <a href={offer.sourceUrl} target="_blank" rel="noreferrer" className="press inline-flex h-9 items-center gap-1 rounded-full border border-border px-2.5 text-[11px] text-text-2">
                  <ExternalLink size={11} /> Open event
                </a>
              )}
            </div>
          </div>
          {!compact && (
            <div className="flex w-28 shrink-0 flex-col gap-2">
              {accepted ? (
                <button
                  disabled={pending}
                  onClick={() => (isEvent ? setAsking("went") : start(async () => notify(await completeOfferAction(offer.id))))}
                  className="press h-11 rounded-sm border border-gold bg-gradient-to-b from-gold-2 to-gold px-3 text-sm font-semibold text-[#1a1406] disabled:opacity-60"
                  style={{ clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}
                >
                  {isEvent ? "Did you go?" : "Complete"}
                </button>
              ) : (
                <button
                  disabled={pending}
                  onClick={() => start(async () => { await acceptOfferAction(offer.id); toast("Quest accepted", "quest", offer.title); })}
                  className="press h-11 rounded-sm border border-gold bg-gradient-to-b from-gold-2 to-gold px-3 text-sm font-semibold text-[#1a1406] disabled:opacity-60"
                  style={{ clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}
                >
                  Accept
                </button>
              )}
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await declineOfferAction(offer.id);
                    setGone(true);
                    toast(accepted ? "Quest abandoned" : "Not now", "quest", "No penalty. Another will appear in time.");
                  })
                }
                className="press h-11 rounded-sm border border-border-strong px-3 text-sm text-text-2 disabled:opacity-60"
                style={{ clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}
              >
                {accepted ? "Abandon" : "Not now"}
              </button>
            </div>
          )}
        </div>
        {!compact && !accepted && <p className="mt-2 text-[10.5px] text-faint">Optional. Declining costs nothing — no XP, rank or streak effect.</p>}
      </div>

      {/* Did you go? → rating → optional cross-domain follow-up. No verification, no guilt. */}
      <Sheet open={asking === "went"} onClose={() => setAsking(null)} title="Did you go?">
        <div className="space-y-2 pb-2">
          <Button full size="lg" variant="gold" disabled={pending} onClick={() => finishAdventure(true)}>
            Yes · +{offer.xpReward} XP
          </Button>
          <Button full variant="secondary" disabled={pending} onClick={() => finishAdventure(false)}>
            Not this time
          </Button>
        </div>
      </Sheet>
      <Sheet open={asking === "rate"} onClose={() => { setAsking(null); router.refresh(); }} title="Quest complete · how was it?">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {(
            [
              ["loved", "Loved it"],
              ["good", "Good"],
              ["meh", "Meh"],
              ["not-for-me", "Not for me"],
            ] as const
          ).map(([k, l]) => (
            <Button key={k} variant="secondary" disabled={pending} onClick={() => start(async () => { await rateAdventureAction(offer.id, k); if (offer.followUp && !offer.followUp.done) setAsking("follow"); else { setAsking(null); setGone(true); router.refresh(); } })}>
              {l}
            </Button>
          ))}
          <p className="col-span-2 text-[11px] text-muted">Used only to pick better adventures next time.</p>
        </div>
      </Sheet>
      <Sheet open={asking === "follow"} onClose={() => { setAsking(null); setGone(true); router.refresh(); }} title="One more thing">
        <div className="space-y-3 pb-2">
          <p className="serif text-[14px] text-text-2">{offer.followUp?.prompt}</p>
          {offer.followUp?.kind === "pantry" && <input value={ingredient} onChange={(e) => setIngredient(e.target.value)} placeholder="e.g. delicata squash" className={inputClass} autoFocus aria-label="Ingredient" />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setAsking(null); setGone(true); router.refresh(); }}>
              Skip
            </Button>
            <Button full variant="gold" disabled={pending || (offer.followUp?.kind === "pantry" && ingredient.trim().length < 2)} onClick={() => start(async () => { const r = await followUpAction(offer.id, { ingredient }); toast(r.message, "quest"); setAsking(null); setGone(true); router.refresh(); })}>
              {offer.followUp?.kind === "pantry" ? "Add to pantry · +10 XP" : "Done"}
            </Button>
          </div>
        </div>
      </Sheet>
    </section>
  );
}

/**
 * Compact card for Home (the full card lives in the Quest journal). Adventures
 * show when + where in one line so the facts are never hidden.
 */
export function SpecialQuestHomeCard({ offer }: { offer: OfferView }) {
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const left = useCountdown(offer.expiresAt);
  if (gone) return null;
  const accepted = offer.status === "accepted";
  const isEvent = !!offer.startAt;
  const clip = { clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" };
  const Icon = isEvent ? Compass : Swords;
  return (
    <section className={cx("plate overflow-hidden px-4 py-3", accepted ? "border-gold/50" : "")} style={{ boxShadow: "0 0 0 1px rgba(212,175,90,0.15), 0 10px 30px -14px rgba(212,175,90,0.35)" }}>
      <div className="flex items-center gap-2 text-[11px]">
        <Icon size={13} className="text-gold" />
        <span className="eyebrow text-gold">{accepted ? (isEvent ? "Active adventure" : "Active quest") : isEvent ? "An adventure appeared" : (KIND_LABEL[offer.kind] ?? "Special quest")}</span>
        <span className="ml-auto inline-flex items-center gap-1 tabular text-gold">
          <Zap size={11} /> +{offer.xpReward} XP
        </span>
      </div>
      <Link href="/quests" className="display mt-1.5 block text-[16px] font-semibold leading-snug">
        {offer.title}
      </Link>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-muted">
        {isEvent ? (
          <>
            <span>{whenLabel(offer.startAt)}</span>
            {offer.venue && <span>{offer.venue}{offer.distanceMi != null ? ` · ${offer.distanceMi} mi` : ""}</span>}
            <span className={offer.priceLabel === "Free" ? "text-success" : ""}>{offer.priceLabel}</span>
          </>
        ) : (
          offer.estimatedMinutes > 0 && <span>~{offer.estimatedMinutes} min</span>
        )}
        {offer.expiresAt && (
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {expiryLabel(left)}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex gap-2">
        {accepted && isEvent ? (
          <Link href="/quests" className="press flex h-11 flex-1 items-center justify-center rounded-sm border border-gold bg-gradient-to-b from-gold-2 to-gold text-sm font-semibold text-[#1a1406]" style={clip}>
            Did you go?
          </Link>
        ) : (
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (accepted) notify(await completeOfferAction(offer.id));
                else {
                  await acceptOfferAction(offer.id);
                  toast("Quest accepted", "quest", offer.title);
                }
              })
            }
            className="press h-11 flex-1 rounded-sm border border-gold bg-gradient-to-b from-gold-2 to-gold text-sm font-semibold text-[#1a1406] disabled:opacity-60"
            style={clip}
          >
            {accepted ? "Complete" : "Accept"}
          </button>
        )}
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await declineOfferAction(offer.id);
              setGone(true);
              toast(accepted ? "Quest abandoned" : "Not now", "quest", "No penalty.");
            })
          }
          className="press h-11 rounded-sm border border-border-strong px-4 text-sm text-text-2 disabled:opacity-60"
          style={clip}
        >
          {accepted ? "Abandon" : "Not now"}
        </button>
      </div>
    </section>
  );
}
