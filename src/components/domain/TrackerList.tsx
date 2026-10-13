"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, ShieldCheck, RotateCcw, Settings2 } from "lucide-react";
import { createSobrietyTrackerAction, deleteSobrietyTrackerAction, resetSobrietyAction, updateSobrietyTrackerAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, ProgressBar, Stat, cx, inputClass } from "@/components/ui/primitives";

interface Milestone {
  days: number;
  label: string;
  xp: number;
}
interface TrackerItem {
  id: number;
  name: string;
  category: string;
  currentRunStart: string | null;
  currentDays: number;
  longestDays: number;
  totalCleanDays: number;
  cleanDays90: number;
  resetsTotal: number;
  nextMilestone: Milestone | null;
  lastMilestone: Milestone | null;
  score: number;
  runs: { startedAt: string; endedAt: string | null; note: string | null }[];
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function elapsed(from: string, now: number) {
  const ms = Math.max(0, now - new Date(from).getTime());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { d, h, m, s, weeks: Math.floor(d / 7), months: Math.floor(d / 30.44) };
}

export function TrackerList({ trackers, milestones }: { trackers: TrackerItem[]; milestones: Milestone[] }) {
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TrackerItem | null>(null);
  const [resetting, setResetting] = useState<TrackerItem | null>(null);

  return (
    <div className="space-y-3">
      {trackers.length === 0 && (
        <div className="card p-5 text-center text-sm text-muted">No trackers yet. Add one for anything you want to stay away from.</div>
      )}
      {trackers.map((t) => {
        const e = t.currentRunStart ? elapsed(t.currentRunStart, now) : null;
        const prev = t.lastMilestone?.days ?? 0;
        const nextD = t.nextMilestone?.days ?? prev;
        const pct = t.nextMilestone ? (t.currentDays - prev) / Math.max(1, nextD - prev) : 1;
        return (
          <div key={t.id} className={cx("card relative overflow-hidden p-4", t.currentDays >= 90 && "rank-glow-s")}>
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-gold" />
              <div className="flex-1 text-sm font-semibold">{t.name}</div>
              <button aria-label="Tracker settings" onClick={() => setEditing(t)} className="press flex h-11 w-11 items-center justify-center rounded-full text-faint hover:bg-white/5">
                <Settings2 size={15} />
              </button>
            </div>
            {e && (
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="tabular display text-4xl font-semibold leading-none">{e.d}</span>
                <span className="text-sm text-muted">day{e.d === 1 ? "" : "s"}</span>
                <span className="tabular ml-2 text-sm text-text-2">
                  {String(e.h).padStart(2, "0")}:{String(e.m).padStart(2, "0")}:{String(e.s).padStart(2, "0")}
                </span>
              </div>
            )}
            {e && (
              <div className="mt-1 text-xs text-muted">
                {e.weeks > 0 && `${e.weeks} week${e.weeks === 1 ? "" : "s"}`}
                {e.months > 0 && ` · ${e.months} month${e.months === 1 ? "" : "s"}`}
                {` · since ${new Date(t.currentRunStart!).toLocaleDateString()}`}
              </div>
            )}
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] text-muted">
                <span>{t.lastMilestone ? `${t.lastMilestone.label} ✓` : "Day one"}</span>
                <span>{t.nextMilestone ? `${t.nextMilestone.label} in ${t.nextMilestone.days - t.currentDays}d · +${t.nextMilestone.xp} XP` : "All milestones reached"}</span>
              </div>
              <ProgressBar value={pct} tone="gold" height="h-1.5" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Best run" value={`${t.longestDays}d`} className="px-3 py-2" />
              <Stat label="Total clean" value={`${t.totalCleanDays}d`} className="px-3 py-2" />
              <Stat label="Last 90" value={`${t.cleanDays90}/90`} className="px-3 py-2" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-faint">{t.resetsTotal === 0 ? "No resets" : `${t.resetsTotal} fresh start${t.resetsTotal === 1 ? "" : "s"} — history kept`}</span>
              <button onClick={() => setResetting(t)} className="press flex items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-2">
                <RotateCcw size={12} /> I slipped — restart
              </button>
            </div>
          </div>
        );
      })}

      <button onClick={() => setAdding(true)} className="press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-sm text-text-2">
        <Plus size={16} /> Add tracker
      </button>

      <div className="card p-4">
        <div className="eyebrow mb-2">Milestones</div>
        <div className="flex flex-wrap gap-1.5">
          {milestones.map((m) => (
            <span key={m.days} className="rounded-full border border-border bg-card-2 px-2.5 py-1 text-[11px] text-text-2">
              {m.label} <span className="text-gold">+{m.xp}</span>
            </span>
          ))}
        </div>
      </div>

      {adding && <AddTracker onClose={() => setAdding(false)} />}
      {editing && <EditTracker t={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetTracker t={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function AddTracker({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"alcohol" | "cannabis" | "nicotine" | "custom">("alcohol");
  const [since, setSince] = useState(new Date().toISOString().slice(0, 10));
  const [pending, start] = useTransition();
  const presets = { alcohol: "Alcohol", cannabis: "Weed", nicotine: "Nicotine", custom: "" };
  return (
    <Sheet
      open
      onClose={onClose}
      title="New tracker"
      footer={
        <Button
          full
          variant="gold"
          disabled={pending || !(name || presets[category])}
          onClick={() =>
            start(async () => {
              await createSobrietyTrackerAction({ name: name || presets[category], category, startedAt: new Date(since + "T00:00:00").toISOString() });
              onClose();
            })
          }
        >
          {pending ? "Saving…" : "Start tracking"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {(["alcohol", "cannabis", "nicotine", "custom"] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} className={cx("press rounded-lg border py-2.5 text-xs font-medium capitalize", c === category ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
              {c === "cannabis" ? "Weed" : c}
            </button>
          ))}
        </div>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={presets[category] || "e.g. Sugar, Gambling, Doomscrolling"} className={inputClass} maxLength={60} />
        </Field>
        <Field label="Clean since">
          <input type="date" value={since} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setSince(e.target.value)} className={inputClass} />
        </Field>
      </div>
    </Sheet>
  );
}

function EditTracker({ t, onClose }: { t: TrackerItem; onClose: () => void }) {
  const [name, setName] = useState(t.name);
  const [since, setSince] = useState(t.currentRunStart ? new Date(t.currentRunStart).toISOString().slice(0, 10) : "");
  const [pending, start] = useTransition();
  return (
    <Sheet
      open
      onClose={onClose}
      title="Tracker settings"
      footer={
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm("Delete this tracker and all of its history?")) start(async () => { await deleteSobrietyTrackerAction(t.id); onClose(); });
            }}
          >
            Delete
          </Button>
          <Button
            full
            variant="gold"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await updateSobrietyTrackerAction(t.id, { name, startedAt: since ? new Date(since + "T00:00:00").toISOString() : undefined });
                onClose();
              })
            }
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={60} />
        </Field>
        <Field label="Current run started" hint="Fix the start date if you set it wrong.">
          <input type="date" value={since} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setSince(e.target.value)} className={inputClass} />
        </Field>
        {t.runs.length > 1 && (
          <div>
            <div className="eyebrow mb-1.5">History</div>
            <ul className="space-y-1 text-xs text-muted">
              {[...t.runs].reverse().map((r, i) => (
                <li key={i}>
                  {new Date(r.startedAt).toLocaleDateString()} → {r.endedAt ? new Date(r.endedAt).toLocaleDateString() : "now"}
                  {r.note ? ` · ${r.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ResetTracker({ t, onClose }: { t: TrackerItem; onClose: () => void }) {
  const { notify } = useFeedback();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <Sheet
      open
      onClose={onClose}
      title="Fresh start"
      footer={
        <Button
          full
          variant="gold"
          disabled={pending}
          onClick={() =>
            start(async () => {
              notify(await resetSobrietyAction(t.id, new Date().toISOString(), note || null));
              onClose();
            })
          }
        >
          {pending ? "…" : "Start a new run now"}
        </Button>
      }
    >
      <p className="text-sm text-text-2">
        You held <span className="font-semibold text-text">{t.currentDays} days</span> on {t.name}. That run stays in your history and still counts toward your total clean days — a reset lowers the score, it never erases it.
      </p>
      <p className="mt-2 text-sm text-muted">Most people who eventually succeed needed a couple of serious attempts. Starting again right now is the whole point.</p>
      <Field label="Note to yourself (optional)" className="mt-4">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? What would help next time?" className={inputClass} maxLength={200} />
      </Field>
    </Sheet>
  );
}
