"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Settings2, Archive } from "lucide-react";
import { completeHabitAction, createHabitAction, deleteHabitAction, uncompleteHabitAction, updateHabitAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";

interface HabitItem {
  id: number;
  name: string;
  icon: string | null;
  scheduleType: "daily" | "weekdays" | "times_per_week";
  weekdays: number[];
  timesPerWeek: number;
  active: boolean;
}
interface HabitStat {
  habitId: number;
  doneToday: boolean;
  dueToday: boolean;
  streak: number;
  adherence30: number;
  thisWeekDone: number;
  thisWeekTarget: number;
}

const DAY = ["S", "M", "T", "W", "T", "F", "S"];
const ICONS = ["📖", "🧘", "📓", "🏃", "💊", "🧹", "💻", "🎸", "🚫", "⏰", "💧", "🌱"];

function scheduleLabel(h: HabitItem) {
  if (h.scheduleType === "daily") return "Every day";
  if (h.scheduleType === "weekdays") return h.weekdays.length === 5 && !h.weekdays.includes(0) && !h.weekdays.includes(6) ? "Weekdays" : h.weekdays.map((d) => DAY[d]).join(" ");
  return `${h.timesPerWeek}× per week`;
}

export function HabitList({ today, habits, stats }: { today: string; habits: HabitItem[]; stats: HabitStat[] }) {
  const { notify } = useFeedback();
  const [, start] = useTransition();
  const [editing, setEditing] = useState<HabitItem | "new" | null>(null);
  const [local, setLocal] = useState<Record<number, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);

  const active = habits.filter((h) => h.active);
  const archived = habits.filter((h) => !h.active);
  const statOf = (id: number) => stats.find((s) => s.habitId === id);

  const toggle = (h: HabitItem) => {
    const s = statOf(h.id);
    const cur = local[h.id] ?? s?.doneToday ?? false;
    const next = !cur;
    setLocal((l) => ({ ...l, [h.id]: next }));
    start(async () => {
      if (next) notify(await completeHabitAction(h.id, today));
      else await uncompleteHabitAction(h.id, today);
    });
  };

  return (
    <div className="space-y-3">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <div className="text-sm font-semibold">Habits</div>
          <span className="tabular text-xs text-muted">
            {active.filter((h) => local[h.id] ?? statOf(h.id)?.doneToday).length}/{active.length} today
          </span>
        </div>
        {active.length === 0 && <p className="px-4 pb-5 text-sm text-muted">No habits yet. Add one below — start with two or three.</p>}
        <ul className="divide-y divide-border/70">
          {active.map((h) => {
            const s = statOf(h.id);
            const done = local[h.id] ?? s?.doneToday ?? false;
            const due = s?.dueToday ?? true;
            return (
              <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => toggle(h)} aria-pressed={done} className={cx("press flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors", done ? "border-success bg-success text-[#071a10]" : "border-border-strong bg-black/30 text-transparent")}>
                  <Check size={16} strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cx("truncate text-[15px]", done && "text-muted line-through decoration-faint", !due && !done && "text-text-2")}>
                    {h.icon && <span className="mr-1.5">{h.icon}</span>}
                    {h.name}
                  </div>
                  <div className="text-xs text-muted">
                    {scheduleLabel(h)}
                    {h.scheduleType === "times_per_week" && s ? ` · ${s.thisWeekDone}/${h.timesPerWeek} this week` : ""}
                    {s && s.streak > 0 ? ` · ${s.streak}-day streak` : ""}
                    {s ? ` · ${Math.round(s.adherence30 * 100)}% (30d)` : ""}
                    {!due && !done ? " · not due today" : ""}
                  </div>
                </div>
                <button aria-label="Habit settings" onClick={() => setEditing(h)} className="press flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-white/5">
                  <Settings2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <button onClick={() => setEditing("new")} className="press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-sm text-text-2">
        <Plus size={16} /> Add habit
      </button>
      {archived.length > 0 && (
        <div>
          <button onClick={() => setShowArchived((v) => !v)} className="flex items-center gap-1.5 px-1 text-xs text-muted">
            <Archive size={12} /> {archived.length} archived {showArchived ? "▴" : "▾"}
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-1">
              {archived.map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2 text-sm text-muted">
                  {h.name}
                  <button className="text-xs text-gold" onClick={() => start(async () => { await updateHabitAction(h.id, { active: true }); })}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {editing && <HabitEditor habit={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function HabitEditor({ habit, onClose }: { habit: HabitItem | null; onClose: () => void }) {
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState<string | null>(habit?.icon ?? null);
  const [type, setType] = useState<HabitItem["scheduleType"]>(habit?.scheduleType ?? "daily");
  const [days, setDays] = useState<number[]>(habit?.weekdays ?? [1, 2, 3, 4, 5]);
  const [times, setTimes] = useState(habit?.timesPerWeek ?? 3);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const payload = { name: name.trim(), icon, scheduleType: type, weekdays: days, timesPerWeek: times };
      if (habit) await updateHabitAction(habit.id, payload);
      else await createHabitAction(payload);
      onClose();
    });
  return (
    <Sheet
      open
      onClose={onClose}
      title={habit ? "Edit habit" : "New habit"}
      footer={
        <div className="flex gap-2">
          {habit && (
            <>
              <Button variant="secondary" onClick={() => start(async () => { await updateHabitAction(habit.id, { active: false }); onClose(); })}>
                Archive
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm("Delete this habit and its history?")) start(async () => { await deleteHabitAction(habit.id); onClose(); });
                }}
              >
                Delete
              </Button>
            </>
          )}
          <Button onClick={save} disabled={pending || !name.trim()} full variant="gold">
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Read 20 minutes" className={inputClass} maxLength={60} autoFocus={!habit} />
        </Field>
        <Field label="Icon (optional)">
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((i) => (
              <button key={i} type="button" onClick={() => setIcon(icon === i ? null : i)} className={cx("press h-9 w-9 rounded-lg border text-lg", icon === i ? "border-gold/60 bg-gold/12" : "border-border bg-card-2")}>
                {i}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Schedule">
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekdays", label: "Specific days" },
              { value: "times_per_week", label: "× per week" },
            ]}
          />
        </Field>
        {type === "weekdays" && (
          <div className="flex gap-1.5">
            {DAY.map((d, i) => (
              <button key={i} type="button" onClick={() => setDays((xs) => (xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i].sort()))} className={cx("press h-10 flex-1 rounded-lg border text-sm", days.includes(i) ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                {d}
              </button>
            ))}
          </div>
        )}
        {type === "times_per_week" && (
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} type="button" onClick={() => setTimes(n)} className={cx("press h-10 flex-1 rounded-lg border text-sm tabular", times === n ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
