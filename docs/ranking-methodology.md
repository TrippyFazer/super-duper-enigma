# Ranking methodology

How Ascend turns logged behaviour into E–S ranks. The engine lives in `src/ranking/` and is pure (no database access), so every rule below is unit-tested in `tests/`. Numbers come from `ranking-research.md`.

## 1. The scale

Every domain produces a **0–100 score**. For percentile-based domains the score is built to track the approximate population percentile of the behaviour; for adherence-based domains it tracks adherence against the guideline. Ranks are fixed score bands (`src/ranking/ranks.ts`):

| Rank | Score | Meaning |
|---|---|---|
| E | 0–29 | Below typical. Fastest place to grow from. |
| D | 30–49 | Around typical; building consistency. |
| C | 50–69 | Clearly above typical (≈ above the median). |
| B | 70–84 | Uncommon discipline (≈ top quarter). |
| A | 85–94 | Exceptional (≈ top 10 %). |
| S | 95–100 | Rare and sustained (≈ top 3–5 %). |

We deliberately did **not** add S+/SS/SSS: they would only re-slice the top 5 % without changing what the user does. Sustained S is already the hard part.

## 2. From metrics to scores

Each substat maps a raw metric to 0–100 through piecewise-linear **anchor tables** (`interpolate()` in `scale.ts`). Anchors are placed at the research thresholds, e.g. sessions/week: `0→4, 1→22, 2→38, 3→55, 4→68, 5→80, 6→90, 7→90` (no credit for a 7th day). Substats combine by weighted mean. Substats with no data are dropped and the remaining weights renormalised, so a user without a step tracker isn't penalised for missing step data.

Rolling windows: most substats use the **last 30 days**, blending in the **last 90 days** (60/40) once the user has 60+ days of history. Consistency substats look at the last 12 weeks.

### Fitness (percentile) — `domains/fitness.ts`
| Substat | Weight | Metric |
|---|---|---|
| Consistency | 30 % | Share of the last 12 weeks with 3+ training days (partial credit for 1–2) |
| Frequency | 30 % | Sessions/week (max 2 per day) 60 % + moderate-equivalent minutes/week 40 % (vigorous ×2) |
| Strength | 12.5 % | Strength days/week; 2 = guideline (62), 3 = 80 |
| Endurance | 12.5 % | Cardio minutes/week + 30 % credit for steps above 6,000/day |
| Activity | 10 % | Average steps/day (Tudor-Locke bands) |
| Recovery | 5 % | Penalties for <2 rest days per fortnight, 7+ day streaks, >8 hard days |

### Sleep (mixed) — `domains/sleep.ts`
| Substat | Weight | Metric |
|---|---|---|
| Duration | 40 % | 30/90-day average (7.0 h → 58, 7.5 h → 76, 8 h → 88, 9.5 h → 65) 65 % + share of nights ≥ target 35 % |
| Regularity | 30 % | Circular SD of bedtime and wake time: ≤30 min → 92–98, 45 → 80, 60 → 66, 90 → 46, 120 → 28 |
| Quality | 20 % | Oura sleep score › efficiency › self-rated (first available) |
| Readiness | 10 % | Oura readiness (dropped if absent) |
| Tracking | 10 % | Share of the last 30 nights with data |

**Ceiling:** the composite cannot exceed `duration score + 20` or `regularity score + 35`. Five hours of perfectly regular sleep stays in E.

### Cooking (percentile) — `domains/cooking.ts`
Meals cooked/week (35 %, max 3/day; 7 → ~56, 12 → 82, 18 → 97), cooking days/week (25 %), active weeks (20 %), range (20 %: distinct dishes in 30 days 60 % + new recipes in 90 days 40 %).

### Wealth (mixed) — `domains/wealth.ts`
Emergency-fund months (30 %; 3 → 58, 6 → 76, 12 → 93), savings rate (25 %; 10 % → 50, 15 % → 68, 20 % → 82), high-interest debt in months of income (20 %; none → 100, 3 months → 40), age-adjusted net-worth percentile (15 %, used directly), retirement balance vs the age-based salary multiple (10 %), check-in consistency + automated investing (10 %). Snapshot-based; the latest check-in is the state.

### Skincare (adherence) — `domains/skincare.ts`
30-day adherence 45 %, 90-day adherence 30 %, current streak 10 %, routine setup 15 % (AM + PM + SPF present). Today only counts once complete.

### Sobriety (adherence) — `domains/sobriety.ts`
Per tracker: current run days 50 % (7 → 28, 30 → 50, 90 → 70, 180 → 85, 365 → 95), clean share of the last 90 days 35 %, resilience 15 % (−25 per reset in 90 days). Domain score = mean across active trackers.

### Habits (adherence) — `domains/habits.ts`
Mean 30-day adherence across habits 45 %, 90-day 30 %, number of habits sustained at ≥70 % 15 %, best streak 10 %. Daily and weekday habits count scheduled days; "N× per week" habits are scored per week.

## 3. Baseline blending

Onboarding answers produce a **baseline score** per domain. While a domain has fewer than 14 days of history the displayed score blends baseline and observed data (observed weight = tenure/14, minimum 15 % once anything is logged). After 14 days the baseline is ignored. This lets an already-fit person start at D on day one without letting anyone *claim* a rank.

## 4. Time gating (diminishing returns)

A rank is only proven by sustained behaviour, so the attainable rank is capped by tenure (`gating.ts`):

| Days tracked | Max rank |
|---|---|
| 0–13 | D |
| 14–29 | C |
| 30–59 | B |
| 60–119 | A |
| 120+ | S |

Wealth gates differently (snapshot-based): first check-in caps at B, 30 days → A, 90 days → S. The raw score is preserved and shown as "keep this up N more days to unlock X rank eligibility". Combined with 30/90-day rolling windows, this makes E→D immediate, C a two-week commitment, and S a four-month, multi-metric achievement. Ranks can also fall when the rolling windows decay; the history records both.

## 5. Overall rank

`engine.ts`:
1. Overall score = weighted mean of active domain scores (weights: fitness 1.25, sleep 1.0, cooking 0.9, wealth 1.0, skincare 0.6, sobriety 1.0, habits 1.0). Inactive domains are excluded entirely.
2. **Balance gate:** overall rank ≤ lowest active domain rank + 2. An S-rank adventurer cannot carry an E-rank domain.
3. Character stats on the sheet (Vitality, Recovery, Nutrition, Wealth, Presence, Willpower, Discipline) are the domain scores.
4. "Requirements remaining" lists the domains furthest below the next overall floor, each with its own top requirement.

## 6. XP and levels

XP is the short-term loop (`xp.ts`): workout 25 (+10 for 45 min), meal 15, new recipe 20, routine 10, habit 8, sleep logged 5 / target 15 / bedtime 10, steps target 10, financial check-in 20, quests 10–100, boss quests 250–500, achievements 10–2,500, sobriety milestones 20–1,000. Every award has an idempotency key and a per-day cap, so repeated or re-logged actions never pay twice and nothing can be farmed (e.g. max 3 meals/day, 2 workouts/day, 8 habit completions/day).

Level L requires `60 · L^1.7` total XP (`levels.ts`): level 10 ≈ 3,000, 18 ≈ 8,200, 30 ≈ 19,500, 50 ≈ 46,500. Honest daily logging yields roughly 600–900 XP/week.

## 7. Quests and achievements

Quests (`quests.ts`) are generated from templates that check applicability (does the user track this?) and personalise targets from recent behaviour (e.g. weekly training target = last-4-week average + 1, capped at 6). Progress is derived from logs on every reconcile; completion awards XP once. Daily quests regenerate each day, weekly ones each Monday, boss quests persist until complete.

Achievements (`achievements.ts`) are declarative `check(context)` predicates evaluated after every mutation; unlocked keys are stored so they fire once. Some grant equippable titles.

## 8. Assumptions and limits
* Population data is US-centric (NHIS, NHANES, SCF, NSDUH). Thresholds are approximations, not clinical assessments.
* Self-reported logs are taken at face value; Oura data overrides manual sleep/steps when connected.
* Percentile-by-age net-worth cells beyond the medians are interpolated estimates from SCF microdata.
* Ranks are feedback, not medical or financial advice.
