/**
 * Recency/frequency ordering for the + LOG sheet. Pure so it is testable;
 * the client stores counts in localStorage.
 */
export type UsageCounts = Record<string, { n: number; last: number }>;

export const USAGE_KEY = "ascend:log:usage";

/** Stable sort: most recently used first, then most used, then original order. */
export function orderByUsage<T extends { key: string }>(items: T[], counts: UsageCounts, opts: { pinFirst?: string[]; now?: number } = {}): T[] {
  const now = opts.now ?? Date.now();
  const DAY = 86_400_000;
  const score = (k: string) => {
    const c = counts[k];
    if (!c) return 0;
    const ageDays = Math.max(0, (now - c.last) / DAY);
    // Recent use dominates; frequency breaks ties; use older than ~3 weeks decays to nothing.
    return Math.max(0, 21 - ageDays) * 10 + Math.min(c.n, 50);
  };
  return items
    .map((it, i) => ({ it, i, s: score(it.key), pin: opts.pinFirst?.indexOf(it.key) ?? -1 }))
    .sort((a, b) => (a.pin >= 0 || b.pin >= 0 ? (a.pin >= 0 ? a.pin : 99) - (b.pin >= 0 ? b.pin : 99) : b.s - a.s || a.i - b.i))
    .map((x) => x.it);
}

export function bump(counts: UsageCounts, key: string, now = Date.now()): UsageCounts {
  const c = counts[key] ?? { n: 0, last: 0 };
  return { ...counts, [key]: { n: c.n + 1, last: now } };
}

export function readUsage(): UsageCounts {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(USAGE_KEY);
    return raw ? (JSON.parse(raw) as UsageCounts) : {};
  } catch {
    return {};
  }
}

export function recordUsage(key: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(bump(readUsage(), key)));
  } catch {
    /* storage unavailable: ordering simply stays default */
  }
}
