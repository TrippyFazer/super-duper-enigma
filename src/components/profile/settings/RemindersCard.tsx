"use client";

import { Card, Segmented, cx, inputClass } from "@/components/ui/primitives";
import type { NotificationPrefs, QuestFrequency } from "@/services/preferences";

const LEADS = [0, 15, 30, 60];

/** Special-quest frequency + every notification and reminder toggle. */
export function RemindersCard({ qf, onQf, notif, onNotif }: { qf: QuestFrequency; onQf: (v: QuestFrequency) => void; notif: NotificationPrefs; onNotif: (next: NotificationPrefs) => void }) {
  const Row = ({ k, label, sub, extra }: { k: keyof NotificationPrefs; label: string; sub?: string; extra?: React.ReactNode }) => (
    <label className="flex min-h-11 items-center justify-between gap-3 py-1 text-sm">
      <span>
        {label}
        {sub && <span className="block text-[11px] text-muted">{sub}</span>}
      </span>
      <span className="flex items-center gap-2">
        {extra}
        <input type="checkbox" checked={!!notif[k]} onChange={(e) => onNotif({ ...notif, [k]: e.target.checked })} className="h-5 w-5 accent-[var(--color-accent)]" />
      </span>
    </label>
  );
  return (
    <>
      <Card className="space-y-3">
        <div className="eyebrow">Special quests</div>
        <Segmented
          value={qf}
          onChange={onQf}
          options={[
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ]}
        />
        <p className="text-[11px] text-muted">Normal ≈ one most days. Declining is always free.</p>
      </Card>

      <Card className="space-y-1">
        <div className="eyebrow mb-1">Notifications</div>
        {(
          [
            ["quest", "Special & expiring quests"],
            ["workout", "Workout ready"],
            ["meals", "Meal plan ready"],
            ["level", "Level up"],
            ["rank", "Rank up"],
            ["achievement", "Achievements"],
            ["sobriety", "Sobriety milestones"],
            ["review", "Weekly review"],
          ] as const
        ).map(([k, l]) => (
          <Row key={k} k={k} label={l} />
        ))}
        <div className="hairline my-2" />
        <div className="text-[10px] uppercase tracking-wider text-faint">Reminders</div>
        <Row k="morningMotivation" label="Morning motivation" sub="At your wake time, from your own reasons." />
        <Row k="windDown" label="Wind-down" sub="Derived from wake time and sleep target." />
        {notif.windDown && (
          <div className="flex items-center gap-2 pl-1 text-xs">
            <span className="text-muted">Remind me</span>
            <select value={String(LEADS.includes(notif.windDownLeadMin) ? notif.windDownLeadMin : "custom")} onChange={(e) => onNotif({ ...notif, windDownLeadMin: e.target.value === "custom" ? 45 : Number(e.target.value) })} className={cx(inputClass, "w-auto py-1.5")} aria-label="Wind-down lead time">
              <option value="0">at wind-down</option>
              <option value="15">15 min before</option>
              <option value="30">30 min before</option>
              <option value="60">60 min before</option>
              <option value="custom">custom</option>
            </select>
            {!LEADS.includes(notif.windDownLeadMin) && <input type="number" inputMode="numeric" min={0} max={240} value={notif.windDownLeadMin} onChange={(e) => onNotif({ ...notif, windDownLeadMin: Number(e.target.value) })} className={cx(inputClass, "w-20 py-1.5 text-center")} aria-label="Custom minutes" />}
          </div>
        )}
        <Row k="workoutReminder" label="Workout reminder" extra={notif.workoutReminder && <input type="time" value={notif.workoutReminderTime} onChange={(e) => onNotif({ ...notif, workoutReminderTime: e.target.value })} className={cx(inputClass, "w-auto py-1")} aria-label="Workout reminder time" />} />
        <Row k="mealPrepReminder" label="Meal prep" sub="On the day prep is planned" />
        <Row k="weeklyPlanning" label="Weekly reset" sub="On your preferred planning day" extra={notif.weeklyPlanning && <input type="time" value={notif.weeklyPlanningTime} onChange={(e) => onNotif({ ...notif, weeklyPlanningTime: e.target.value })} className={cx(inputClass, "w-auto py-1")} aria-label="Weekly planning time" />} />
        <p className="pt-1 text-[11px] text-muted">Device notifications are enabled from the Notices screen.</p>
      </Card>
    </>
  );
}
