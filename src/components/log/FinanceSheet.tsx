"use client";

import { useState, useTransition } from "react";
import { addFinancialSnapshotAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, cx, inputClass } from "@/components/ui/primitives";

interface Prefill {
  netWorth?: number | null;
  liquidSavings?: number | null;
  monthlyExpenses?: number | null;
  monthlyIncome?: number | null;
  savingsRatePct?: number | null;
  highInterestDebt?: number | null;
  totalDebt?: number | null;
  retirementBalance?: number | null;
  investsMonthly?: boolean;
}

export function FinanceSheet({ open, onClose, date, prefill }: { open: boolean; onClose: () => void; date: string; prefill?: Prefill | null }) {
  const { notify } = useFeedback();
  const [f, setF] = useState<Record<string, string>>({
    liquidSavings: str(prefill?.liquidSavings),
    monthlyExpenses: str(prefill?.monthlyExpenses),
    monthlyIncome: str(prefill?.monthlyIncome),
    savingsRatePct: str(prefill?.savingsRatePct),
    highInterestDebt: str(prefill?.highInterestDebt ?? 0),
    totalDebt: str(prefill?.totalDebt),
    netWorth: str(prefill?.netWorth),
    retirementBalance: str(prefill?.retirementBalance),
  });
  const [invests, setInvests] = useState(prefill?.investsMonthly ?? false);
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const num = (k: string) => (f[k] === "" || f[k] == null ? null : Number(f[k]));

  const submit = () =>
    start(async () => {
      const r = await addFinancialSnapshotAction({
        date,
        liquidSavings: num("liquidSavings"),
        monthlyExpenses: num("monthlyExpenses"),
        monthlyIncome: num("monthlyIncome"),
        savingsRatePct: num("savingsRatePct"),
        highInterestDebt: num("highInterestDebt"),
        totalDebt: num("totalDebt"),
        netWorth: num("netWorth"),
        retirementBalance: num("retirementBalance"),
        investsMonthly: invests,
      });
      notify(r);
      if (r.ok) onClose();
    });

  const Money = ({ k, label, hint }: { k: string; label: string; hint?: string }) => (
    <Field label={label} hint={hint}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input type="number" inputMode="decimal" value={f[k]} onChange={set(k)} placeholder="0" className={cx(inputClass, "pl-7")} />
      </div>
    </Field>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Financial check-in"
      footer={
        <Button onClick={submit} disabled={pending} full size="lg" variant="gold">
          {pending ? "Saving…" : "Save check-in · +20 XP"}
        </Button>
      }
    >
      <p className="mb-4 text-xs text-muted">Fill in what you know; leave the rest blank. Stored only on your device&apos;s server. Estimates, not advice.</p>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Money k="liquidSavings" label="Liquid savings" hint="Cash + checking + savings" />
          <Money k="monthlyExpenses" label="Monthly expenses" />
          <Money k="monthlyIncome" label="Monthly income" hint="Gross" />
          <Field label="Savings rate %" hint="Saved + invested ÷ income">
            <input type="number" inputMode="decimal" value={f.savingsRatePct} onChange={set("savingsRatePct")} placeholder="15" className={inputClass} />
          </Field>
          <Money k="highInterestDebt" label="High-interest debt" hint="Cards, payday, >8% APR" />
          <Money k="totalDebt" label="Total debt" hint="Incl. mortgage, loans" />
          <Money k="netWorth" label="Net worth" hint="Assets − liabilities" />
          <Money k="retirementBalance" label="Retirement balance" hint="401k / IRA / pension" />
        </div>
        <label className={cx("flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-3", invests ? "border-accent/50 bg-accent/10" : "border-border bg-card-2")}>
          <div>
            <div className="text-sm font-medium">I invest automatically every month</div>
            <div className="text-xs text-muted">Any amount counts.</div>
          </div>
          <input type="checkbox" checked={invests} onChange={(e) => setInvests(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
        </label>
      </div>
    </Sheet>
  );
}

function str(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}
