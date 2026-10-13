"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Swords, Clock, Zap } from "lucide-react";
import { acceptOfferAction, completeOfferAction, declineOfferAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { cx } from "@/components/ui/primitives";

export interface OfferView {
  id: number;
  title: string;
  description: string;
  domain: string;
  difficulty: string;
  kind: string;
  estimatedMinutes: number;
  xpReward: number;
  status: string;
  expiresAt: string | null;
}

const KIND_LABEL: Record<string, string> = { special: "Special quest", side: "Side quest", recovery: "Recovery quest", social: "Social quest", discipline: "Discipline quest", bonus: "Bonus quest" };
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

/** The NPC-style optional quest card. Decline is free and says so. */
export function SpecialQuestCard({ offer, compact }: { offer: OfferView; compact?: boolean }) {
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const left = useCountdown(offer.expiresAt);
  if (gone) return null;
  const accepted = offer.status === "accepted";

  return (
    <section className={cx("plate overflow-hidden", accepted ? "border-gold/50" : "")} style={{ boxShadow: "0 0 0 1px rgba(212,175,90,0.15), 0 10px 30px -14px rgba(212,175,90,0.35)" }}>
      <div className="relative px-4 pt-3 pb-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords size={14} className="text-gold" />
            <span className="eyebrow text-gold">{KIND_LABEL[offer.kind] ?? "Special quest"}</span>
          </div>
          <span className="rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">{accepted ? "Active" : "Optional"}</span>
        </div>
        <div className="gold-rule my-2.5" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="display text-[17px] font-semibold leading-snug">{offer.title}</div>
            {offer.description && <div className="serif mt-0.5 text-[14.5px] text-text-2">{offer.description}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
              <span className="inline-flex items-center gap-1 text-gold">
                <Zap size={12} /> Reward: +{offer.xpReward} XP
              </span>
              <span className={cx("capitalize", DIFF_TONE[offer.difficulty])}>{offer.difficulty}</span>
              {offer.estimatedMinutes > 0 && <span>~{offer.estimatedMinutes} min</span>}
              {offer.expiresAt && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} /> {expiryLabel(left)}
                </span>
              )}
            </div>
          </div>
          {!compact && (
            <div className="flex w-28 shrink-0 flex-col gap-2">
              {accepted ? (
                <button
                  disabled={pending}
                  onClick={() => start(async () => notify(await completeOfferAction(offer.id)))}
                  className="press rounded-sm border border-gold bg-gradient-to-b from-gold-2 to-gold px-3 py-2.5 text-sm font-semibold text-[#1a1406] disabled:opacity-60"
                  style={{ clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}
                >
                  Complete
                </button>
              ) : (
                <button
                  disabled={pending}
                  onClick={() => start(async () => { await acceptOfferAction(offer.id); toast("Quest accepted", "quest", offer.title); })}
                  className="press rounded-sm border border-gold bg-gradient-to-b from-gold-2 to-gold px-3 py-2.5 text-sm font-semibold text-[#1a1406] disabled:opacity-60"
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
                    toast("Quest declined", "quest", "No penalty. Another will appear in time.");
                  })
                }
                className="press rounded-sm border border-border-strong px-3 py-2 text-sm text-text-2 disabled:opacity-60"
                style={{ clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}
              >
                {accepted ? "Abandon" : "Decline"}
              </button>
            </div>
          )}
        </div>
        {!compact && !accepted && <p className="mt-2 text-[10.5px] text-faint">Optional. Declining costs nothing — no XP, rank or streak effect.</p>}
      </div>
    </section>
  );
}

/**
 * The Home version: one line of context, the title, the reward, two buttons.
 * The full card (description, difficulty, the "declining costs nothing" note)
 * lives in the Quest journal. On a small phone the full card filled the first
 * screen and pushed Today below the fold.
 */
export function SpecialQuestHomeCard({ offer }: { offer: OfferView }) {
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const left = useCountdown(offer.expiresAt);
  if (gone) return null;
  const accepted = offer.status === "accepted";
  const clip = { clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" };

  return (
    <section className={cx("plate overflow-hidden px-4 py-3", accepted ? "border-gold/50" : "")} style={{ boxShadow: "0 0 0 1px rgba(212,175,90,0.15), 0 10px 30px -14px rgba(212,175,90,0.35)" }}>
      <div className="flex items-center gap-2 text-[11px]">
        <Swords size={13} className="text-gold" />
        <span className="eyebrow text-gold">{accepted ? "Active quest" : (KIND_LABEL[offer.kind] ?? "Special quest")}</span>
        <span className="ml-auto inline-flex items-center gap-1 tabular text-gold">
          <Zap size={11} /> +{offer.xpReward} XP
        </span>
      </div>
      <Link href="/quests" className="display mt-1.5 block text-[16px] font-semibold leading-snug">
        {offer.title}
      </Link>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-muted">
        {offer.estimatedMinutes > 0 && <span>~{offer.estimatedMinutes} min</span>}
        {offer.expiresAt && (
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {expiryLabel(left)}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex gap-2">
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
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await declineOfferAction(offer.id);
              setGone(true);
              toast(accepted ? "Quest abandoned" : "Quest declined", "quest", "No penalty.");
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
