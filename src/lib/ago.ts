/** "just now", "42m ago", "3h ago", "2d ago" — how long since a timestamp. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
}
