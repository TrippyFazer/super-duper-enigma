"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RANK_FLOORS } from "@/ranking/ranks";
import { formatShort } from "@/lib/dates";

const C = {
  grid: "#242a3a",
  axis: "#5b6070",
  gold: "#d4af5a",
  accent: "#7c83ff",
  success: "#5fcf9b",
  muted: "#868b9c",
  tooltipBg: "#161a24",
};

const tooltipStyle = { background: C.tooltipBg, border: `1px solid ${C.grid}`, borderRadius: 10, fontSize: 12, color: "#ece9e1" };

/** Score over time with rank floors as faint reference lines. */
export function ScoreHistoryChart({ data, height = 180 }: { data: { date: string; score: number }[]; height?: number }) {
  if (data.length < 2) return <ChartEmpty text="Score history appears after a couple of days of data." height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d: string) => formatShort(d)} tick={{ fill: C.axis, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={32} />
        <YAxis domain={[0, 100]} tick={{ fill: C.axis, fontSize: 10 }} axisLine={false} tickLine={false} ticks={[0, 30, 50, 70, 85, 95]} />
        {(["D", "C", "B", "A", "S"] as const).map((r) => (
          <ReferenceLine key={r} y={RANK_FLOORS[r]} stroke={C.grid} strokeDasharray="2 4" label={{ value: r, position: "right", fill: C.axis, fontSize: 9 }} />
        ))}
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => formatShort(String(d))} formatter={(v) => [Number(v).toFixed(1), "Score"]} />
        <Line type="monotone" dataKey="score" stroke={C.gold} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: C.gold }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Generic bars per period (e.g. sessions per week) with optional target line. */
export function BarsChart({
  data,
  target,
  height = 160,
  color = C.accent,
  unit = "",
  labelKey = "label",
}: {
  data: { label: string; value: number; hit?: boolean }[];
  target?: number | null;
  height?: number;
  color?: string;
  unit?: string;
  labelKey?: string;
}) {
  if (data.every((d) => d.value === 0)) return <ChartEmpty text="Nothing logged in this range yet." height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }} barCategoryGap="28%">
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={labelKey} tick={{ fill: C.axis, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={12} />
        <YAxis tick={{ fill: C.axis, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        {target != null && <ReferenceLine y={target} stroke={C.gold} strokeDasharray="4 4" label={{ value: "target", position: "insideTopRight", fill: C.gold, fontSize: 9 }} />}
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v}${unit}`, ""]} />
        <Bar dataKey="value" fill={color} radius={[5, 5, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Day-level heatmap (calendar-ish): values 0..1 per date, newest last. */
export function DayHeatmap({ days, tone = "accent" }: { days: { date: string; value: number | null; label?: string }[]; tone?: "accent" | "gold" | "success" }) {
  const color = tone === "gold" ? "212,175,90" : tone === "success" ? "95,207,155" : "124,131,255";
  // Pad to start on Monday for a tidy grid
  const first = days[0]?.date;
  const pad = first ? ((new Date(first + "T00:00:00Z").getUTCDay() + 6) % 7) : 0;
  const cells = [...Array.from({ length: pad }, () => null), ...days];
  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] text-faint">
            {d}
          </div>
        ))}
        {cells.map((c, i) =>
          c === null ? (
            <div key={`p${i}`} />
          ) : (
            <div
              key={c.date}
              title={`${formatShort(c.date)}${c.label ? ` · ${c.label}` : ""}`}
              className="aspect-square rounded-[4px] border border-white/[0.04]"
              style={{ background: c.value == null ? "rgba(255,255,255,0.03)" : `rgba(${color},${0.15 + 0.85 * Math.max(0, Math.min(1, c.value))})` }}
            />
          ),
        )}
      </div>
    </div>
  );
}

export function XpChart({ data, height = 140 }: { data: { date: string; xp: number }[]; height?: number }) {
  if (data.every((d) => d.xp === 0)) return <ChartEmpty text="No XP earned in this range." height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }} barCategoryGap="30%">
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d: string) => formatShort(d)} tick={{ fill: C.axis, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis tick={{ fill: C.axis, fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={tooltipStyle} labelFormatter={(d) => formatShort(String(d))} formatter={(v) => [`${v} XP`, ""]} />
        <Bar dataKey="xp" fill={C.gold} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Simple multi-metric sleep chart: hours per night with target line. */
export function SleepChart({ data, targetMin, height = 160 }: { data: { date: string; hours: number }[]; targetMin: number; height?: number }) {
  if (!data.length) return <ChartEmpty text="No nights logged in this range." height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }} barCategoryGap="30%">
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d: string) => formatShort(d)} tick={{ fill: C.axis, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis domain={[0, 10]} tick={{ fill: C.axis, fontSize: 10 }} axisLine={false} tickLine={false} />
        <ReferenceLine y={targetMin / 60} stroke={C.gold} strokeDasharray="4 4" />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={tooltipStyle} labelFormatter={(d) => formatShort(String(d))} formatter={(v) => [`${Number(v).toFixed(1)}h`, "Sleep"]} />
        <Bar dataKey="hours" fill={C.accent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartEmpty({ text, height }: { text: string; height: number }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-border text-center text-xs text-muted" style={{ height }}>
      {text}
    </div>
  );
}
