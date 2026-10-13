import type { Rank } from "@/ranking/types";
import { cx } from "./primitives";

export const RANK_COLOR: Record<Rank, string> = {
  E: "text-rank-e",
  D: "text-rank-d",
  C: "text-rank-c",
  B: "text-rank-b",
  A: "text-rank-a",
  S: "text-rank-s",
};

export const RANK_BG: Record<Rank, string> = {
  E: "bg-rank-e/12 border-rank-e/30",
  D: "bg-rank-d/12 border-rank-d/30",
  C: "bg-rank-c/12 border-rank-c/30",
  B: "bg-rank-b/12 border-rank-b/30",
  A: "bg-rank-a/12 border-rank-a/30",
  S: "bg-rank-s/15 border-rank-s/45",
};

export function RankBadge({ rank, size = "md", className }: { rank: Rank; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const s =
    size === "sm"
      ? "h-7 w-7 text-sm rounded-md"
      : size === "lg"
        ? "h-14 w-14 text-3xl rounded-2xl"
        : size === "xl"
          ? "h-24 w-24 text-6xl rounded-[1.75rem]"
          : "h-10 w-10 text-xl rounded-xl";
  return (
    <span
      className={cx(
        "display inline-flex shrink-0 items-center justify-center border font-semibold leading-none",
        s,
        RANK_BG[rank],
        RANK_COLOR[rank],
        rank === "S" && "rank-glow-s",
        className,
      )}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

export function RankText({ rank, className }: { rank: Rank; className?: string }) {
  return <span className={cx("display font-semibold", RANK_COLOR[rank], className)}>{rank}</span>;
}
