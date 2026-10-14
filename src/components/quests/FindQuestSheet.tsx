"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Compass, MapPin, CalendarDays, ExternalLink, Zap, Sparkles } from "lucide-react";
import { acceptAdventureAction, acceptFallbackAction, findQuestsAction } from "@/actions/adventure";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, cx } from "@/components/ui/primitives";
import { whenLabel } from "./SpecialQuestCard";

type Result = Awaited<ReturnType<typeof findQuestsAction>>;
type Win = "now" | "tonight" | "weekend" | "surprise";
type Cost = "free" | "under20" | "under50" | "any";

/** FIND ME A QUEST: the deliberate entry point for real-world discovery. 2–4 verified options, never invented. */
export function FindQuestSheet({ open, onClose, ready, reason, defaultCost }: { open: boolean; onClose: () => void; ready: boolean; reason: string | null; defaultCost: Cost }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [win, setWin] = useState<Win>("tonight");
  const [cost, setCost] = useState<Cost>(defaultCost);
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  const search = () =>
    start(async () => {
      const r = await findQuestsAction({ window: win, cost });
      setRes(r);
    });
  const accept = (c: Result["candidates"][number]) =>
    start(async () => {
      const r = await acceptAdventureAction({ eventId: c.eventId, title: c.title, description: c.description, why: c.why });
      if (!r.ok) return toast(r.error ?? "Could not accept", "error");
      toast("Adventure accepted", "quest", c.title);
      onClose();
      router.refresh();
    });

  return (
    <Sheet open={open} onClose={onClose} title="Find me a quest">
      <div className="space-y-3 pb-2">
        {!ready && (
          <div className="rounded-lg border border-border bg-card-2 px-3 py-2 text-xs text-text-2">
            {reason}{" "}
            <Link href="/profile/settings#adventure" className="text-gold underline">
              Settings
            </Link>
          </div>
        )}
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="When">
          {(
            [
              ["now", "Right now"],
              ["tonight", "Tonight"],
              ["weekend", "Weekend"],
              ["surprise", "Surprise me"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setWin(k)} aria-pressed={win === k} className={cx("press h-11 rounded-lg border text-[12px]", win === k ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Cost">
          {(
            [
              ["free", "Free"],
              ["under20", "Under $20"],
              ["under50", "Under $50"],
              ["any", "Any"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setCost(k)} aria-pressed={cost === k} className={cx("press h-10 flex-1 rounded-full border text-[11.5px]", cost === k ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
              {l}
            </button>
          ))}
        </div>
        <Button full size="lg" variant="gold" disabled={pending} onClick={search}>
          <Compass size={16} /> {pending ? "Searching nearby…" : res ? "Search again" : "Find a quest"}
        </Button>

        {res && (
          <div className="space-y-2">
            {res.error && <p className="rounded-lg border border-border bg-card-2 px-3 py-2 text-xs text-text-2">{res.error}</p>}
            {res.candidates.length > 0 && <div className="eyebrow pt-1">Choose your adventure</div>}
            {res.candidates.map((c, i) => (
              <div key={c.eventId} className="plate px-3.5 py-3">
                <div className="flex items-start gap-2">
                  <span className="display w-5 shrink-0 text-sm text-gold">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="display text-[15px] font-semibold leading-snug">{c.title}</div>
                    <div className="text-[12.5px] text-text-2">{c.eventName}</div>
                    <div className="serif mt-0.5 text-[13px] text-muted">{c.description}</div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-text-2">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays size={11} /> {whenLabel(c.startAt)}
                      </span>
                      {(c.venue || c.distanceMi != null) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={11} /> {c.venue ?? ""}
                          {c.distanceMi != null ? ` · ${c.distanceMi} mi` : ""}
                        </span>
                      )}
                      <span className={c.isFree ? "text-success" : ""}>{c.price}</span>
                      <span className="inline-flex items-center gap-1 text-gold">
                        <Zap size={11} /> +{c.xp} XP
                      </span>
                      {c.framing === "ai" && (
                        <span className="inline-flex items-center gap-1 text-faint">
                          <Sparkles size={10} /> framed by AI · facts via {c.sourceName}
                        </span>
                      )}
                    </div>
                    {c.why && <div className="serif mt-1 text-[12px] italic text-muted">{c.why}</div>}
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer" className="press flex h-10 items-center gap-1 rounded-full border border-border px-3 text-xs text-text-2">
                      <ExternalLink size={12} /> View
                    </a>
                  )}
                  <Button full variant="gold" disabled={pending} onClick={() => accept(c)}>
                    Accept
                  </Button>
                </div>
              </div>
            ))}
            {res.candidates.length === 0 && (
              <>
                <p className="serif text-[13.5px] text-muted">{res.ready ? "Nothing real fits that window and budget. Here are a few quests that need no event:" : "Without a home area and an event source, here are a few quests that need no event:"}</p>
                {res.fallback.map((f) => (
                  <div key={f.templateKey ?? f.title} className="plate flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">{f.title}</div>
                      <div className="serif text-[12.5px] text-muted">{f.description}</div>
                    </div>
                    <span className="tabular text-xs text-gold">+{f.xpReward}</span>
                    {f.templateKey && (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await acceptFallbackAction(f.templateKey!); if (r.ok) { toast("Quest accepted", "quest", f.title); onClose(); router.refresh(); } })}>
                        Accept
                      </Button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
