import type { DomainAssessment } from "@/ranking/types";
import type { ProfileView } from "@/services/profile";
import { loadFinancialSnapshots } from "@/services/loaders";
import { formatShort } from "@/lib/dates";
import { Card, SectionTitle, Stat } from "@/components/ui/primitives";
import { BarsChart } from "@/components/charts/Charts";
import { FinanceCheckinButton } from "./FinanceCheckinButton";
import { DeleteButton } from "./DeleteButton";

const money = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);

export function WealthView({ profile, assessment }: { profile: ProfileView; assessment: DomainAssessment; range: 7 | 30 | 90 }) {
  const snaps = loadFinancialSnapshots();
  const latest = snaps[snaps.length - 1];
  const ef = latest?.liquidSavings != null && latest.monthlyExpenses ? latest.liquidSavings / latest.monthlyExpenses : null;
  const nwSeries = snaps.filter((s) => s.netWorth != null).slice(-12).map((s) => ({ label: formatShort(s.date), value: Math.round((s.netWorth ?? 0) / 1000) }));

  return (
    <div className="space-y-4">
      <FinanceCheckinButton today={profile.today} prefill={latest ?? null} />
      <p className="px-1 text-[11px] text-faint">Personal estimates only, computed locally from your check-ins. Not financial advice.</p>

      {latest ? (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Emergency" value={ef != null ? `${ef.toFixed(1)} mo` : "—"} sub="expenses covered" />
            <Stat label="Savings rate" value={latest.savingsRatePct != null ? `${Math.round(latest.savingsRatePct)}%` : "—"} sub="of income" />
            <Stat label="Net worth" value={latest.netWorth != null ? `$${Math.round(latest.netWorth / 1000)}k` : "—"} sub={assessment.percentile != null ? `~${Math.round(assessment.percentile)}th pct for age` : "add age in settings"} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="High-interest debt" value={money(latest.highInterestDebt)} sub={latest.highInterestDebt === 0 ? "none — excellent" : "pay this first"} />
            <Stat label="Retirement" value={money(latest.retirementBalance)} sub={latest.investsMonthly ? "investing monthly" : "not automated"} />
          </div>
          {nwSeries.length >= 2 && (
            <Card>
              <SectionTitle className="mb-3 px-0">Net worth ($k)</SectionTitle>
              <BarsChart data={nwSeries} unit="k" color="#d4af5a" />
            </Card>
          )}
          <Card className="p-0">
            <div className="px-4 pt-3.5 pb-2 text-sm font-semibold">Check-ins</div>
            <ul className="divide-y divide-border/70">
              {[...snaps].reverse().slice(0, 12).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-14 shrink-0 text-xs text-muted">{formatShort(s.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-2">
                    NW {money(s.netWorth)} · saved {money(s.liquidSavings)} · rate {s.savingsRatePct ?? "—"}% · debt {money(s.highInterestDebt)}
                  </span>
                  <DeleteButton kind="snapshot" id={s.id} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <Card className="text-sm text-muted">
          <div className="mb-1 font-medium text-text">No check-ins yet</div>
          Add your first check-in to get a wealth rank. Benchmarks are age-adjusted and based on Federal Reserve survey data — see docs/ranking-research.md.
        </Card>
      )}
    </div>
  );
}
