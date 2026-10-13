"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Star, Bookmark, Clock, Plus, X } from "lucide-react";
import { Button, PageHeader, cx, inputClass } from "@/components/ui/primitives";
import { RECIPE_TAGS, PANTRY_STAPLES as STAPLES } from "@/lib/recipe-constants";

export interface RecipeCard {
  id: number;
  name: string;
  description: string;
  ingredients: string[];
  mealType: string;
  prepTimeMin: number;
  cookTimeMin: number;
  difficulty: string;
  tags: string[];
  isFavorite: boolean;
  isSaved: boolean;
  proteinG: number | null;
  source: string;
}


export function RecipeFinder({ recipes }: { recipes: RecipeCard[]; today: string }) {
  const [q, setQ] = useState("");
  const [have, setHave] = useState<string[]>([]);
  const [ingInput, setIngInput] = useState("");
  const [meal, setMeal] = useState<string>("any");
  const [maxTime, setMaxTime] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [view, setView] = useState<"all" | "saved" | "favorites">("all");

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out: { r: RecipeCard; matched: string[]; missing: string[]; score: number }[] = [];
    for (const r of recipes) {
      if (view === "saved" && !r.isSaved && !r.isFavorite) continue;
      if (view === "favorites" && !r.isFavorite) continue;
      if (meal !== "any" && r.mealType !== meal && r.mealType !== "any") continue;
      if (maxTime && r.prepTimeMin + r.cookTimeMin > maxTime) continue;
      if (tags.length && !tags.every((t) => r.tags.includes(t))) continue;
      if (query && !`${r.name} ${r.description} ${r.ingredients.join(" ")} ${r.tags.join(" ")}`.toLowerCase().includes(query)) continue;
      const matched: string[] = [];
      const missing: string[] = [];
      for (const ing of r.ingredients) {
        if (have.some((h) => ing.includes(h) || h.includes(ing))) matched.push(ing);
        else if (!STAPLES.has(ing)) missing.push(ing);
      }
      let score = 50;
      if (have.length) {
        if (!matched.length) continue;
        const nonStaple = r.ingredients.filter((i) => !STAPLES.has(i)).length || 1;
        score = (matched.length / nonStaple) * 100 - missing.length * 5;
      }
      if (r.isFavorite) score += 8;
      if (r.isSaved) score += 4;
      out.push({ r, matched, missing, score });
    }
    return out.sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));
  }, [recipes, q, have, meal, maxTime, tags, view]);

  const addIng = () => {
    const v = ingInput.trim().toLowerCase();
    if (v && !have.includes(v)) setHave((h) => [...h, v]);
    setIngInput("");
  };

  return (
    <div className="page space-y-4">
      <PageHeader
        title="Recipes"
        subtitle="Find something you can actually make tonight."
        right={
          <Link href="/recipes/new" className="press flex h-9 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs text-text-2">
            <Plus size={14} /> New
          </Link>
        }
      />

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes" className={cx(inputClass, "pl-10")} />
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium text-text-2">What do you have?</div>
        <div className="flex gap-2">
          <input
            value={ingInput}
            onChange={(e) => setIngInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addIng();
              }
            }}
            placeholder="chicken, rice, eggs…"
            className={inputClass}
          />
          <Button variant="secondary" onClick={addIng}>
            Add
          </Button>
        </div>
        {have.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {have.map((h) => (
              <button key={h} onClick={() => setHave((xs) => xs.filter((x) => x !== h))} className="press inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gold/10 px-2.5 py-1 text-xs text-gold">
                {h} <X size={11} />
              </button>
            ))}
            <button onClick={() => setHave([])} className="px-2 text-xs text-muted">
              clear
            </button>
          </div>
        )}
      </div>

      <div className="scroll-x -mx-4 flex gap-1.5 px-4">
        {[
          ["any", "Any meal"],
          ["breakfast", "Breakfast"],
          ["lunch", "Lunch"],
          ["dinner", "Dinner"],
          ["snack", "Snack"],
        ].map(([v, l]) => (
          <Chip key={v} active={meal === v} onClick={() => setMeal(v)}>
            {l}
          </Chip>
        ))}
        <span className="mx-1 w-px shrink-0 bg-border" />
        {[15, 30, 45].map((t) => (
          <Chip key={t} active={maxTime === t} onClick={() => setMaxTime(maxTime === t ? null : t)}>
            <Clock size={11} /> ≤{t}m
          </Chip>
        ))}
      </div>
      <div className="scroll-x -mx-4 flex gap-1.5 px-4">
        {RECIPE_TAGS.map((t) => (
          <Chip key={t.id} active={tags.includes(t.id)} onClick={() => setTags((xs) => (xs.includes(t.id) ? xs.filter((x) => x !== t.id) : [...xs, t.id]))}>
            {t.label}
          </Chip>
        ))}
      </div>
      <div className="flex gap-1.5">
        {(["all", "saved", "favorites"] as const).map((v) => (
          <Chip key={v} active={view === v} onClick={() => setView(v)}>
            {v === "all" ? `All (${recipes.length})` : v === "saved" ? `Saved (${recipes.filter((r) => r.isSaved || r.isFavorite).length})` : `Favorites (${recipes.filter((r) => r.isFavorite).length})`}
          </Chip>
        ))}
      </div>

      <div className="space-y-2.5">
        {results.length === 0 && <div className="card p-6 text-center text-sm text-muted">Nothing matches. Try fewer filters, or add a recipe of your own.</div>}
        {results.map(({ r, matched, missing }) => (
          <Link key={r.id} href={`/recipes/${r.id}`} className="card press block p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold">{r.name}</span>
                  {r.isFavorite && <Star size={13} className="shrink-0 fill-gold text-gold" />}
                  {!r.isFavorite && r.isSaved && <Bookmark size={13} className="shrink-0 text-accent-2" />}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted">{r.description}</div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted">
                <div className="tabular">{r.prepTimeMin + r.cookTimeMin} min</div>
                <div className="capitalize">{r.difficulty}</div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {r.tags.slice(0, 4).map((t) => (
                <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-text-2">
                  {t}
                </span>
              ))}
              {r.proteinG != null && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-text-2">{r.proteinG}g protein</span>}
            </div>
            {have.length > 0 && (
              <div className="mt-2 text-[11px]">
                <span className="text-success">Uses {matched.join(", ")}</span>
                {missing.length > 0 && <span className="text-muted"> · needs {missing.slice(0, 4).join(", ")}{missing.length > 4 ? "…" : ""}</span>}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx("press inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium", active ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card text-text-2")}>
      {children}
    </button>
  );
}
