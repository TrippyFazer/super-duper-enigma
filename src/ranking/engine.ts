import { DOMAINS } from "./domains";
import { assessCooking, type CookingInput } from "./domains/cooking";
import { assessFitness, type FitnessInput } from "./domains/fitness";
import { assessHabits, type HabitsInput } from "./domains/habits";
import { assessSkincare, type SkincareInput } from "./domains/skincare";
import { assessSleep, type SleepDomainInput } from "./domains/sleep";
import { assessSobriety, type SobrietyInput } from "./domains/sobriety";
import { assessWealth, type WealthInput } from "./domains/wealth";
import { levelFromXp } from "./levels";
import { RANK_FLOORS, nextRank, progressWithinRank, rankCeiling, rankIndex, scoreToRank, clamp01 } from "./ranks";
import { round, weightedMean } from "./scale";
import type { CharacterAssessment, DomainAssessment, DomainId, Rank } from "./types";

export interface EngineInput {
  activeDomains: DomainId[];
  totalXp: number;
  fitness?: FitnessInput;
  sleep?: SleepDomainInput;
  cooking?: CookingInput;
  wealth?: WealthInput;
  skincare?: SkincareInput;
  sobriety?: SobrietyInput;
  habits?: HabitsInput;
}

export function assessDomain(id: DomainId, input: EngineInput): DomainAssessment | null {
  switch (id) {
    case "fitness":
      return input.fitness ? assessFitness(input.fitness) : null;
    case "sleep":
      return input.sleep ? assessSleep(input.sleep) : null;
    case "cooking":
      return input.cooking ? assessCooking(input.cooking) : null;
    case "wealth":
      return input.wealth ? assessWealth(input.wealth) : null;
    case "skincare":
      return input.skincare ? assessSkincare(input.skincare) : null;
    case "sobriety":
      return input.sobriety ? assessSobriety(input.sobriety) : null;
    case "habits":
      return input.habits ? assessHabits(input.habits) : null;
  }
}

/**
 * Overall rank rules (docs/ranking-methodology.md → Overall rank):
 *  1. Overall score = weighted mean of active domain scores (domain weights in
 *     `domains.ts`). Domains with no data count as 0 — an adventurer is judged
 *     on the life they said they wanted to level.
 *  2. Balance gate: the overall rank can be at most two ranks above the
 *     lowest active domain. An S-rank adventurer cannot have an E-rank domain.
 *  3. Requirements list the domains furthest from the next overall floor.
 */
export function assessCharacter(input: EngineInput): CharacterAssessment {
  const domains: DomainAssessment[] = [];
  for (const id of input.activeDomains) {
    const a = assessDomain(id, input);
    if (a) domains.push(a);
  }

  const weighted = domains.map((d) => ({ score: d.score, weight: DOMAINS[d.domain].weight }));
  const rawOverall = domains.length ? weightedMean(weighted) : 0;

  // Balance gate
  const lowest = domains.reduce<Rank | null>((acc, d) => (acc == null || rankIndex(d.rank) < rankIndex(acc) ? d.rank : acc), null);
  let overallScore = rawOverall;
  let gateNote: string | null = null;
  if (lowest) {
    const capIdx = Math.min(5, rankIndex(lowest) + 2);
    const capRank = (["E", "D", "C", "B", "A", "S"] as Rank[])[capIdx];
    const capCeil = rankCeiling(capRank);
    if (overallScore > capCeil) {
      overallScore = capCeil;
      const weakest = domains.filter((d) => d.rank === lowest).map((d) => DOMAINS[d.domain].name);
      gateNote = `Overall rank is capped at ${capRank} until ${weakest.join(" & ")} ${weakest.length > 1 ? "rise" : "rises"} above ${lowest} rank`;
    }
  }
  overallScore = round(overallScore, 1);
  const overallRank = scoreToRank(overallScore);
  const p = progressWithinRank(overallScore);
  const next = nextRank(overallRank);

  // Requirements: domains whose score is below the next overall floor, biggest weighted gap first.
  const requirements: string[] = [];
  if (gateNote) requirements.push(gateNote);
  if (next) {
    const floor = RANK_FLOORS[next];
    const gaps = domains
      .filter((d) => d.score < floor)
      .map((d) => ({ d, gap: (floor - d.score) * DOMAINS[d.domain].weight }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 4);
    for (const { d } of gaps) {
      const firstReq = d.next.requirements[0];
      requirements.push(`${DOMAINS[d.domain].name}: ${firstReq ?? `reach ${Math.round(floor)} score`}`);
    }
  }

  const stats = domains.map((d) => ({ name: DOMAINS[d.domain].statName, value: Math.round(d.score), domain: d.domain }));
  const lvl = levelFromXp(input.totalXp);

  return {
    overall: {
      score: overallScore,
      rank: overallRank,
      next: { rank: next, progress: clamp01(p.progress), requirements: requirements.slice(0, 5) },
    },
    domains,
    stats,
    level: {
      level: lvl.level,
      totalXp: input.totalXp,
      xpIntoLevel: lvl.xpIntoLevel,
      xpForNextLevel: lvl.xpForNextLevel,
      progress: lvl.progress,
    },
  };
}

export { DOMAINS };
