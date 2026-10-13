import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getProfile } from "@/services/profile";
import { getScoreHistory, reconcile } from "@/services/progression";
import { DOMAINS, isDomainId } from "@/ranking/domains";
import { addDays } from "@/lib/dates";
import { PageHeader } from "@/components/ui/primitives";
import { DomainHeader, RangeTabs } from "@/components/domain/DomainHeader";
import { FitnessView } from "@/components/domain/FitnessView";
import { SleepView } from "@/components/domain/SleepView";
import { CookingView } from "@/components/domain/CookingView";
import { WealthView } from "@/components/domain/WealthView";
import { SkincareView } from "@/components/domain/SkincareView";
import { SobrietyView } from "@/components/domain/SobrietyView";
import { HabitsView } from "@/components/domain/HabitsView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  return { title: isDomainId(domain) ? DOMAINS[domain].name : "Domain" };
}

export default async function DomainPage({ params, searchParams }: { params: Promise<{ domain: string }>; searchParams: Promise<{ range?: string }> }) {
  const { domain } = await params;
  const sp = await searchParams;
  if (!isDomainId(domain)) notFound();
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");

  const range = ([7, 30, 90] as const).find((n) => String(n) === sp.range) ?? 30;
  const { assessment } = reconcile();
  const a = assessment.domains.find((d) => d.domain === domain);
  const meta = DOMAINS[domain];
  const history = getScoreHistory(domain, addDays(profile.today, -89), profile.today).map((h) => ({ date: h.date, score: h.score }));

  const views = {
    fitness: FitnessView,
    sleep: SleepView,
    cooking: CookingView,
    wealth: WealthView,
    skincare: SkincareView,
    sobriety: SobrietyView,
    habits: HabitsView,
  } as const;
  const View = views[domain];

  return (
    <div className="page space-y-4">
      <PageHeader title={meta.name} subtitle={meta.description} back="/" right={<RangeTabs current={range} base={`/domains/${domain}`} />} />
      {!a ? (
        <div className="card p-5 text-sm text-muted">
          This domain is not active. Enable it in <a className="text-gold underline" href="/profile/settings">settings</a>.
        </div>
      ) : (
        <>
          <Suspense>
            <View profile={profile} assessment={a} range={range} />
          </Suspense>
          <DomainHeader a={a} history={history} />
        </>
      )}
    </div>
  );
}
