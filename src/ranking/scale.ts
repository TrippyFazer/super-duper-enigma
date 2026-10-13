/**
 * Small numeric helpers used by every domain scorer.
 */

export type Anchor = [input: number, score: number];

/**
 * Piecewise-linear interpolation through anchor points.
 * Anchors must be sorted by input ascending. Values outside the range clamp
 * to the first/last anchor's score.
 *
 * Example: sessions/week → score
 *   interpolate([[0,0],[1,25],[3,55],[5,85],[6,95]], 4) === 70
 */
export function interpolate(anchors: Anchor[], x: number): number {
  if (anchors.length === 0) return 0;
  if (Number.isNaN(x)) return anchors[0][1];
  if (x <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i];
    const [x0, y0] = anchors[i - 1];
    if (x <= x1) {
      const t = x1 === x0 ? 1 : (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

/** Interpolation where higher input is worse (e.g. debt). Anchors still ascending by input. */
export function interpolateDesc(anchors: Anchor[], x: number): number {
  return interpolate(anchors, x);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function round(x: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** Weighted mean of {score, weight}; weights normalized. */
export function weightedMean(items: { score: number; weight: number }[]): number {
  const total = items.reduce((a, b) => a + b.weight, 0);
  if (total === 0) return 0;
  return items.reduce((a, b) => a + b.score * b.weight, 0) / total;
}

/**
 * Circular standard deviation for clock times (minutes since midnight).
 * Bedtimes around midnight (23:30, 00:30) should read as 1h apart, not 23h.
 */
export function circularStdMinutes(minutesList: number[]): number {
  if (minutesList.length < 2) return 0;
  const toRad = (m: number) => (m / 1440) * 2 * Math.PI;
  const sin = mean(minutesList.map((m) => Math.sin(toRad(m))));
  const cos = mean(minutesList.map((m) => Math.cos(toRad(m))));
  const R = Math.sqrt(sin * sin + cos * cos);
  if (R >= 1) return 0;
  const sdRad = Math.sqrt(-2 * Math.log(R));
  return (sdRad / (2 * Math.PI)) * 1440;
}

/** Circular mean of clock times in minutes since midnight. */
export function circularMeanMinutes(minutesList: number[]): number {
  if (minutesList.length === 0) return 0;
  const toRad = (m: number) => (m / 1440) * 2 * Math.PI;
  const sin = mean(minutesList.map((m) => Math.sin(toRad(m))));
  const cos = mean(minutesList.map((m) => Math.cos(toRad(m))));
  let rad = Math.atan2(sin, cos);
  if (rad < 0) rad += 2 * Math.PI;
  return (rad / (2 * Math.PI)) * 1440;
}
