import Link from "next/link";
import { ChefHat, Sparkles } from "lucide-react";
import type { DomainAssessment } from "@/ranking/types";
import type { ProfileView } from "@/services/profile";
import { loadMeals, loadRecipes } from "@/services/loaders";
import { addDays, formatShort, formatWeekdayShort, lastNDays, startOfWeek } from "@/lib/dates";
import { LogHereButton } from "@/components/log/LogHereButton";
import { BarsChart, DayHeatmap } from "@/components/charts/Charts";
import { Card, SectionTitle, Stat } from "@/components/ui/primitives";
import { DeleteButton } from "./DeleteButton";

export function CookingView({ profile, range }: { profile: ProfileView; assessment: DomainAssessment; range: 7 | 30 | 90 }) {
  const today = profile.today;
  const meals = loadMeals(today);
  const recipes = loadRecipes();
  const days = lastNDays(today, range);
  const inRange = meals.filter((m) => m.date >= days[0]);
  const cookDays = new Set(inRange.map((m) => m.date)).size;
  const distinct = new Set(inRange.map((m) => (m.recipeId != null ? `r${m.recipeId}` : m.name.toLowerCase()))).size;
  const newCount = inRange.filter((m) => m.isNewRecipe).length;

  const nWeeks = Math.max(1, Math.ceil(range / 7));
  const weeks: { label: string; value: number }[] = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const ws = addDays(startOfWeek(today), -7 * i);
    const we = addDays(ws, 6);
    weeks.push({ label: formatShort(ws), value: meals.filter((m) => m.date >= ws && m.date <= we).length });
  }
  const dailyBars = range === 7 ? days.map((d) => ({ label: formatWeekdayShort(d), value: meals.filter((m) => m.date === d).length })) : null;
  const heat = lastNDays(today, 91).map((d) => {
    const n = meals.filter((m) => m.date === d).length;
    return { date: d, value: n ? Math.min(1, n / 3) : null, label: n ? `${n} meal${n === 1 ? "" : "s"}` : "none" };
  });

  const favorites = recipes.filter((r) => r.isFavorite).slice(0, 4);

  return (
    <div className="space-y-4">
      <LogHereButton kind="food" label="Log food or a cooked meal" />

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Meals" value={inRange.length} sub={`${Math.round((inRange.length / range) * 7 * 10) / 10}/wk`} />
        <Stat label="Cook days" value={cookDays} sub={`of ${range}`} />
        <Stat label="Range" value={distinct} sub={`${newCount} new`} />
      </div>

      <Link href="/recipes" className="card press flex items-center gap-3 px-4 py-3">
        <ChefHat size={18} className="text-gold" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Find something to cook</div>
          <div className="text-xs text-muted">Search by what&apos;s in your fridge, time, or mood.</div>
        </div>
        <Sparkles size={14} className="text-faint" />
      </Link>

      <Card>
        <SectionTitle className="mb-3 px-0">{range === 7 ? "Meals per day" : "Meals per week"}</SectionTitle>
        {dailyBars ? <BarsChart data={dailyBars} color="#5fcf9b" /> : <BarsChart data={weeks} target={profile.targets.mealsPerWeekTarget} color="#5fcf9b" />}
      </Card>

      <Card>
        <SectionTitle className="mb-3 px-0">Last 13 weeks</SectionTitle>
        <DayHeatmap days={heat} tone="success" />
      </Card>

      {favorites.length > 0 && (
        <Card className="p-0">
          <div className="px-4 pt-3.5 pb-2 text-sm font-semibold">Favorites</div>
          <ul className="divide-y divide-border/70">
            {favorites.map((r) => (
              <li key={r.id}>
                <Link href={`/recipes/${r.id}`} className="press flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>{r.name}</span>
                  <span className="text-xs text-muted">{r.prepTimeMin + r.cookTimeMin} min</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-0">
        <div className="px-4 pt-3.5 pb-2 text-sm font-semibold">Recent meals</div>
        {inRange.length === 0 ? (
          <p className="px-4 pb-5 text-sm text-muted">Nothing cooked in this range yet.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {[...inRange].reverse().slice(0, 15).map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {m.name}
                    {m.isNewRecipe && <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent-2">new</span>}
                  </div>
                  <div className="text-xs capitalize text-muted">
                    {m.mealType} · {formatShort(m.date)}
                  </div>
                </div>
                <DeleteButton kind="meal" id={m.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
