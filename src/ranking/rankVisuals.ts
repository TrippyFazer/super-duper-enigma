import type { Rank } from "./types";

/**
 * The knight progression: every rank has a title, a short quote, a palette
 * and an art set. Art lives in /public/art (SVG, lightweight) and is layered
 * behind real components — never used as a screenshot.
 */
export interface RankVisual {
  rank: Rank;
  title: string;
  quote: string;
  /** Short description of the armour / atmosphere, used for alt text. */
  description: string;
  /** Primary accent for this rank's UI (bars, badges, glows). */
  accent: string;
  accentSoft: string;
  /** Secondary metal/cloth colours used in the crest. */
  metal: string;
  cloth: string;
  /** XP bar gradient. */
  bar: string;
  crest: string; // /art/crest-X.svg
  backdrop: string; // /art/backdrop-X.svg
}

export const RANK_VISUALS: Record<Rank, RankVisual> = {
  E: {
    rank: "E",
    title: "Novice Squire",
    quote: "Every legend starts somewhere.",
    description: "Worn iron, simple leather, dark cloth. A small crest, a humble camp under a stormy sky.",
    accent: "#9aa0ae",
    accentSoft: "rgba(154,160,174,0.18)",
    metal: "#6b7080",
    cloth: "#2b3140",
    bar: "linear-gradient(90deg,#5e6577,#9aa0ae)",
    crest: "/art/crest-E.svg",
    backdrop: "/art/backdrop-E.svg",
  },
  D: {
    rank: "D",
    title: "Rising Adventurer",
    quote: "Consistency forges the path.",
    description: "Better iron and blue cloth. Early heraldry, banners on a road to the first keep.",
    accent: "#6f9fd8",
    accentSoft: "rgba(111,159,216,0.18)",
    metal: "#8b93a6",
    cloth: "#1f3a6b",
    bar: "linear-gradient(90deg,#3f6cb0,#6f9fd8)",
    crest: "/art/crest-D.svg",
    backdrop: "/art/backdrop-D.svg",
  },
  C: {
    rank: "C",
    title: "Seasoned Knight",
    quote: "Progress has become a habit.",
    description: "Polished steel with gold trim, a detailed crest, castle banners at dusk.",
    accent: "#5fcf9b",
    accentSoft: "rgba(95,207,155,0.16)",
    metal: "#b8bfcc",
    cloth: "#213a73",
    bar: "linear-gradient(90deg,#3b8fd1,#79b4ec)",
    crest: "/art/crest-C.svg",
    backdrop: "/art/backdrop-C.svg",
  },
  B: {
    rank: "B",
    title: "Elite Knight",
    quote: "Discipline now shapes destiny.",
    description: "High plate armour, blue and gold heraldry, a fur mantle, a fortified city at nightfall.",
    accent: "#7c83ff",
    accentSoft: "rgba(124,131,255,0.18)",
    metal: "#c9d0dc",
    cloth: "#2a3f8a",
    bar: "linear-gradient(90deg,#4f58d9,#8f95ff)",
    crest: "/art/crest-B.svg",
    backdrop: "/art/backdrop-B.svg",
  },
  A: {
    rank: "A",
    title: "Royal Champion",
    quote: "Excellence is now the baseline.",
    description: "White and gold ornate armour, royal heraldry, a cathedral hall lit by candles.",
    accent: "#c9a6ff",
    accentSoft: "rgba(201,166,255,0.18)",
    metal: "#e6e8ef",
    cloth: "#f1e6c8",
    bar: "linear-gradient(90deg,#b58cf0,#e0cdfa)",
    crest: "/art/crest-A.svg",
    backdrop: "/art/backdrop-A.svg",
  },
  S: {
    rank: "S",
    title: "Legendary Paladin",
    quote: "Few ever reach this summit.",
    description: "Luminous gold and ivory, legendary heraldry, a shining citadel above the clouds.",
    accent: "#e8c46a",
    accentSoft: "rgba(232,196,106,0.2)",
    metal: "#f3e7c1",
    cloth: "#fff7e0",
    bar: "linear-gradient(90deg,#a8853d,#f3d98c)",
    crest: "/art/crest-S.svg",
    backdrop: "/art/backdrop-S.svg",
  },
};

export const RANK_TITLES: string[] = Object.values(RANK_VISUALS).map((v) => v.title);

export function rankTitle(rank: Rank): string {
  return RANK_VISUALS[rank].title;
}
