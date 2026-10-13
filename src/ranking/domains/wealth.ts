import { addDays, diffDays, type ISODate } from "@/lib/dates";
import { buildAssessment, sub } from "../assess";
import { WEALTH_TENURE_CAPS } from "../gating";
import { interpolate, round } from "../scale";
import type { DomainAssessment } from "../types";

export interface FinancialSnapshotInput {
  date: ISODate;
  netWorth?: number | null;
  liquidSavings?: number | null;
  monthlyExpenses?: number | null;
  monthlyIncome?: number | null;
  savingsRatePct?: number | null;
  highInterestDebt?: number | null;
  totalDebt?: number | null;
  retirementBalance?: number | null;
  investsMonthly?: boolean | null;
}

export interface WealthInput {
  asOf: ISODate;
  snapshots: FinancialSnapshotInput[];
  age?: number | null;
  startedOn?: ISODate | null;
}

/**
 * Age-adjusted household net worth percentiles (USD, SCF 2022 microdata;
 * see docs/ranking-research.md → Wealth). Columns: p25, p50, p75, p90, p95.
 * Treat as approximate; the engine interpolates between them.
 */
export const NET_WORTH_BY_AGE: { maxAge: number; p: [number, number, number, number, number] }[] = [
  { maxAge: 34, p: [2_000, 39_000, 150_000, 370_000, 600_000] },
  { maxAge: 44, p: [25_000, 135_600, 420_000, 980_000, 1_600_000] },
  { maxAge: 54, p: [45_000, 247_200, 750_000, 1_900_000, 3_100_000] },
  { maxAge: 64, p: [60_000, 364_500, 1_100_000, 2_600_000, 4_500_000] },
  { maxAge: 74, p: [75_000, 409_900, 1_200_000, 3_000_000, 5_000_000] },
  { maxAge: 200, p: [70_000, 335_600, 1_000_000, 2_600_000, 4_400_000] },
];

/** Fidelity salary multiples: 1x by 30, 3x by 40, 6x by 50, 8x by 60, 10x by 67. */
const RETIREMENT_MULTIPLE_BY_AGE: [number, number][] = [
  [25, 0],
  [30, 1],
  [35, 2],
  [40, 3],
  [45, 4.5],
  [50, 6],
  [55, 7],
  [60, 8],
  [67, 10],
];

/** Emergency fund months → score. 24% have none; 46% have ≥3 months; 27% have ≥6. */
const EMERGENCY_MONTHS: [number, number][] = [
  [0, 4],
  [0.25, 18],
  [1, 34],
  [3, 58],
  [6, 76],
  [9, 86],
  [12, 93],
  [18, 97],
];
/** Savings rate (% of gross income). US aggregate ≈ 4.6%; 15% = Fidelity target. */
const SAVINGS_RATE: [number, number][] = [
  [-5, 0],
  [0, 6],
  [5, 30],
  [10, 50],
  [15, 68],
  [20, 82],
  [30, 93],
  [40, 97],
];
/** Months of income needed to clear high-interest debt → score (lower is better). */
const HI_DEBT_MONTHS: [number, number][] = [
  [0, 100],
  [0.25, 80],
  [1, 62],
  [3, 40],
  [6, 22],
  [12, 8],
];
/** Total debt-to-income (annual) ratio → score. 36% DTI rule ≈ monthly; here annualized total debt / annual income. */
const RETIREMENT_RATIO: [number, number][] = [
  [0, 8],
  [0.25, 35],
  [0.5, 52],
  [1, 72],
  [1.5, 86],
  [2, 94],
  [3, 98],
];

export function netWorthPercentile(netWorth: number, age: number | null | undefined): number {
  const bracket = NET_WORTH_BY_AGE.find((b) => (age ?? 35) <= b.maxAge) ?? NET_WORTH_BY_AGE[NET_WORTH_BY_AGE.length - 1];
  const [p25, p50, p75, p90, p95] = bracket.p;
  const anchors: [number, number][] = [
    [-50_000, 3],
    [0, 12],
    [p25, 25],
    [p50, 50],
    [p75, 75],
    [p90, 90],
    [p95, 95],
    [p95 * 3, 99],
  ];
  // Ensure monotonic inputs (p25 could be < 0 for young brackets in theory).
  anchors.sort((a, b) => a[0] - b[0]);
  return interpolate(anchors, netWorth);
}

export function retirementTargetMultiple(age: number): number {
  return interpolate(RETIREMENT_MULTIPLE_BY_AGE, age);
}

export function assessWealth(input: WealthInput): DomainAssessment {
  const compute = (asOf: ISODate) => computeScore(input, asOf).score;
  const has = (d: ISODate) => input.snapshots.some((s) => s.date <= d);
  const score7 = has(addDays(input.asOf, -7)) ? compute(addDays(input.asOf, -7)) : null;
  const score30 = has(addDays(input.asOf, -30)) ? compute(addDays(input.asOf, -30)) : null;
  return computeScore(input, input.asOf, { score7, score30 }).assessment;
}

function computeScore(
  input: WealthInput,
  asOf: ISODate,
  previous?: { score7: number | null; score30: number | null },
): { score: number; assessment: DomainAssessment } {
  const snaps = input.snapshots.filter((s) => s.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  const latest = snaps[snaps.length - 1];
  const first = snaps[0]?.date;
  const startedOn = [input.startedOn, first].filter(Boolean).sort()[0] as ISODate | undefined;
  const tenureDays = startedOn ? Math.max(0, diffDays(startedOn, asOf) + 1) : 0;

  if (!latest) {
    const assessment = buildAssessment({
      domain: "wealth",
      substats: [],
      tenureDays,
      dataPoints: 0,
      caps: WEALTH_TENURE_CAPS,
      explanation: ["Add a financial check-in to get a wealth rank. Everything is an estimate, not advice."],
      previous,
      suggestedAction: "Add your first financial check-in",
    });
    return { score: assessment.score, assessment };
  }

  const expenses = latest.monthlyExpenses ?? null;
  const income = latest.monthlyIncome ?? null;
  const annualIncome = income != null ? income * 12 : null;

  // Emergency fund
  const efMonths = latest.liquidSavings != null && expenses ? latest.liquidSavings / expenses : null;
  const efScore = efMonths != null ? interpolate(EMERGENCY_MONTHS, efMonths) : null;

  // Savings rate
  const srScore = latest.savingsRatePct != null ? interpolate(SAVINGS_RATE, latest.savingsRatePct) : null;

  // High-interest debt (months of income to clear)
  let debtScore: number | null = null;
  let debtValue = "unknown";
  if (latest.highInterestDebt != null) {
    if (latest.highInterestDebt <= 0) {
      debtScore = 100;
      debtValue = "no high-interest debt";
    } else if (income) {
      const months = latest.highInterestDebt / income;
      debtScore = interpolate(HI_DEBT_MONTHS, months);
      debtValue = `$${Math.round(latest.highInterestDebt).toLocaleString()} (${round(months, 1)} mo of income)`;
    } else {
      debtScore = latest.highInterestDebt > 5000 ? 25 : 55;
      debtValue = `$${Math.round(latest.highInterestDebt).toLocaleString()}`;
    }
  }

  // Net worth percentile for age
  const nwPct = latest.netWorth != null ? netWorthPercentile(latest.netWorth, input.age) : null;

  // Retirement multiple
  let retScore: number | null = null;
  let retValue = "unknown";
  if (latest.retirementBalance != null && annualIncome && input.age) {
    const target = retirementTargetMultiple(input.age);
    if (target <= 0) {
      retScore = latest.retirementBalance > 0 ? 80 : 40;
      retValue = `$${Math.round(latest.retirementBalance).toLocaleString()} (ahead of schedule)`;
    } else {
      const ratio = latest.retirementBalance / (annualIncome * target);
      retScore = interpolate(RETIREMENT_RATIO, ratio);
      retValue = `${round(latest.retirementBalance / annualIncome, 1)}× income vs ${target}× target`;
    }
  }

  // Consistency: monthly check-ins + investing monthly
  const snaps90 = snaps.filter((s) => s.date >= addDays(asOf, -90));
  const checkinScore = Math.min(100, 40 + snaps90.length * 20);
  const investScore = latest.investsMonthly ? 100 : 30;
  const consistencyScore = checkinScore * 0.5 + investScore * 0.5;

  const substats = [
    sub("emergency", "Emergency fund", efScore ?? 0, efMonths != null ? `${round(efMonths, 1)} months of expenses` : "unknown", 0.3, {
      available: efScore != null,
      improve: efMonths != null && efMonths < 3 ? "Build liquid savings to 3 months of expenses" : "Grow the emergency fund toward 6–12 months",
    }),
    sub("savings", "Savings rate", srScore ?? 0, latest.savingsRatePct != null ? `${round(latest.savingsRatePct, 0)}% of income` : "unknown", 0.25, {
      available: srScore != null,
      improve: (latest.savingsRatePct ?? 0) < 15 ? "Raise your savings rate toward 15% of income" : "Push savings rate past 20%",
    }),
    sub("debt", "Debt health", debtScore ?? 0, debtValue, 0.2, {
      available: debtScore != null,
      improve: "Pay down high-interest (credit card) debt first",
    }),
    sub("networth", "Net worth (age-adj.)", nwPct ?? 0, nwPct != null ? `~${Math.round(nwPct)}th percentile for your age` : "unknown", 0.15, {
      available: nwPct != null,
      note: "Estimated percentile vs. US households in your age bracket (SCF)",
      improve: "Grow net worth — assets up, liabilities down",
    }),
    sub("retirement", "Retirement", retScore ?? 0, retValue, 0.1, {
      available: retScore != null,
      note: "Balance vs. the age-based salary multiple guideline",
      improve: "Increase retirement contributions toward the age milestone",
    }),
    sub("consistency", "Consistency", consistencyScore, `${snaps90.length} check-ins (90d)${latest.investsMonthly ? " · investing monthly" : ""}`, 0.1, {
      improve: latest.investsMonthly ? "Keep monthly check-ins going" : "Automate a monthly investment, however small",
    }),
  ];

  const explanation = [
    "Wealth rank is about resilience, not income: emergency fund, savings rate and debt carry 75% of the weight.",
    "Benchmarks: 46% of US adults have 3+ months of expenses saved, 27% have 6+; 46% of cardholders carry a balance month to month.",
    "Personal estimate only — not financial advice.",
  ];
  if (nwPct != null) explanation.push(`Net worth is roughly the ${Math.round(nwPct)}th percentile for your age bracket.`);

  const daysSinceCheckin = diffDays(latest.date, asOf);
  const suggestedAction = daysSinceCheckin >= 30 ? "Do your monthly financial check-in" : undefined;

  const assessment = buildAssessment({
    domain: "wealth",
    substats,
    tenureDays,
    dataPoints: snaps.length,
    caps: WEALTH_TENURE_CAPS,
    explanation,
    percentile: nwPct ?? undefined,
    previous,
    suggestedAction,
  });
  return { score: assessment.score, assessment };
}
