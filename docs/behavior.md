# Behavioral intelligence — 0.5.0

Two principles drive this pass: **plans are defaults, not rules**, and **quests should sometimes feel like actual adventures**. Nothing in the UX structure changed (navigation, Home, universal logging, Planner, visual direction). The intelligence behind it did.

## States the system understands

| State | Where it lives |
|---|---|
| PLANNED | planned meals (`planned`), workout plans, grocery plans |
| SUGGESTED | quest offers (`offered`), the preferred-day weekly-reset card, "Replan the next N days" |
| ACTUAL | nutrition entries, workouts, sleep nights, purchases, completed prep |
| AVAILABLE NOW | adventure candidates in the current window; "I'm shopping today" on any day |
| COMPLETED | `completed` offers, `eaten` meals, finished sessions, shopped weeks |
| SKIPPED | `skipped` meals, `declined` / "Not this time" offers (never a penalty) |
| RESCHEDULED | `replannedFrom` on a plan, prep done on another day, a workout on a non-training day |
| NO LONGER RELEVANT | `expired` offers (event start + grace), `discarded` meals, plans whose end date passed |

## 1–6. Calendar assumptions audited

Every weekday-bound rule was classified as *preference* or *hard requirement* (search terms: Sunday, Monday, weekday, shoppingDay, trainingDays, weekly reset, meal prep day).

| Rule | Was | Now |
|---|---|---|
| Grocery plan start | Monday of the planning week, chosen from Sat/Sun/shopping day | Any date, any span (`grocery_weeks.days`, `kind` week/supply). `suggestedPlanStart` is only what the preferred-day card suggests. |
| Active plan | "This week" = Monday row | `activeWeekRow(today)`: whichever plan covers today, newest first (a Wednesday supply run wins over the weekly plan) |
| Weekly quests (plan / shop within budget / prep) | Monday row or next Monday | The active or next plan — shopping on a Wednesday pays exactly like shopping on Sunday |
| Meal-prep reminder | Fired only on the preferred day | Fires on the day the prep is planned for, whatever weekday |
| Weekly-reset reminder | Preferred day | Still the preferred day (a suggestion), skipped when a plan already covers the next three days |
| Prep date | Day before Monday | Day before the plan starts, or today when the plan starts today |
| "Sunday reset" label | Fixed | `<Preferred day> reset` on that day, `Weekly reset` otherwise; `START WEEKLY RESET NOW` from Planner any day (`/planner/week?start=today`) |
| Workout reminder | Training days | Unchanged: a preference. Weekly training quests count sessions, not days; a Tuesday workout instead of Monday is full credit |
| Habit schedules | Weekday schedules | Unchanged: these are the user's own stated schedule |

Hard calendar requirements that remain: an event's start time (adventure expiry), notification keys per day.

## 3–5. Groceries any day, ad-hoc planning, mid-week replan

* Planner → **Groceries** is always actionable with real states: *No active list → Build shopping list*, *Shopping list ready → Start shopping*, *Shopped → Pantry (updated)*. "I'm shopping today" is available in every state.
* **I'M SHOPPING TODAY** asks only: how many days (3 / 5 / 7 / custom), budget, use pantry leftovers. It generates meal ideas, the list, an estimated total and ingredient reuse, accepts a **Supply run** quest (+50 XP, completes when the trip is finished), and opens the shopping step.
* **REPLAN THE NEXT N DAYS** regenerates only today onward, with the pantry and the budget actually left (`budget − actual spend`). Earlier days, eaten meals and purchased items stay. A replan after shopping keeps the week "shopped".

## 7–12. Today semantics (resolved ≠ successful)

`services/todayState.ts` is pure and unit-tested; `TodayCard` renders tones: **success · resolved · pending · attention · neutral**.

* **Food**: protein target hit is a success state, not completion: "Protein goal hit ✓ · 1,400 / 2,400 kcal". The day resolves only on an explicit *Done eating for today* (Food screen) or late at night with calories in range. Nothing logged is ordinary at 7:10 AM and noteworthy at 8:30 PM.
* **Sleep**: last night is resolved whatever the number. 7h 02m against 8h shows "0h 58m below target · resolved" and, after 15:00, "tonight: wind down 30 min earlier"; the Home wind-down card shifts its time by that amount.
* **Steps**: `AVAILABLE / ACTUAL ZERO / PENDING / UNAVAILABLE` (`health/freshness.ts`). "Activity syncing…" instead of 0; "Oura last synced 5h ago" only when stale (≥3 h). The walk offer appears only with real current data.
* **Workout**: done only when an actual workout exists. A planned workout still open at 9 PM becomes attention with "still time for something short"; at 9 AM it is neutral. A *rest day* flag resolves the row with "nothing owed".
* **Quests / Routines**: unchanged semantics, expressed through the same tones.

## 13–37. Adventure quests

Pipeline (`services/adventure.ts`):

```
EVENT SEARCH (Ticketmaster Discovery · public ICS calendars) → local_events cache
  → deterministic filter (quests/adventure.ts): window, radius, transport feasibility,
    cost preference, recently offered, "not interested", weather for outdoor
  → score: interests (love/interested/neutral/no) + learned affinity + distance + cost + novelty
  → pick 2–4, max two per category
  → AI frames only those (title / objective / why); ids must match, safety filter applies
  → offer built from the cached event — never from the model or the client
```

* **Sources**: `TICKETMASTER_API_KEY`, `EVENT_ICS_URLS`. Facts stored: name, description, category, start/end, venue, address, coordinates, price range, free flag, URL, source. Fetches are cached per area for 6 hours; discovery runs automatically at most once a day (Thu–Sat and the weekend, ~25 % of other days, only with no open quest) and on **Find a quest**.
* **Location**: a typed home area (city / ZIP / region → coordinates via Open-Meteo geocoding) and a radius (5/10/20/30 mi). No GPS, no background tracking.
* **Weather**: Open-Meteo forecast, cached per day. Severe or wet weather removes outdoor quests; good weather nudges them up. Enhancement only.
* **Interests**: 16 chips, four levels, taught further by accept / decline / rating (bounded affinity per category).
* **Cost**: free only / under $20 / under $50 / any. Price is shown on every card ("Free", "~$18", "$7–25"). XP never scales with price: base by category (hike 80, class 75, festival 70, music 60 … film 50), +5 for a new venue, +5 for a long trip, capped 45–85.
* **Card**: event name, objective, when, venue + distance, price, "via Ticketmaster", why it may fit, **Open event** link to the original source. Expiry = event start + 2 h (or event end + 30 min). Expired = "expired", no guilt language.
* **Completion**: *Did you go?* → Yes (XP) / Not this time (nothing happens) → *How was it?* (Loved it / Good / Meh / Not for me) → optional cross-domain follow-up: a market quest asks for the ingredient you picked up and adds it to the pantry (+10 XP), feeding later recipe suggestions.
* **Find a quest** (Quest journal): Right now / Tonight / This weekend / Surprise me × cost. Returns "Choose your adventure" with 2–4 real options. If every source fails: "Couldn't refresh nearby events." plus three curated non-event quests. If nothing fits: curated quests. Never a fabricated result.
* **Create quest**: your own task, accepted immediately (15–60 XP). Optional AI enhance; without AI, grocery-shaped tasks become "Supply run" and everything else keeps your words.
* **Quest families** (underlying `kind`): daily · special · side · recovery · social · discipline · bonus · adventure · discovery · custom; boss quests remain in the ranking engine.
* **Novelty**: library templates are not re-offered within 14 days; adventure events never repeat and the same venue scores half for 30 days; a category offered in the last 3 days scores 0.6×.

## Tests

`tests/flex.test.ts` (supply run from any date, non-preferred-day shopping completes quests, Friday weekly reset, moved workout, moved prep, replan keeps eaten meals and budget left), `tests/todayState.test.ts` (protein at noon, explicit finish, sleep resolved-not-successful, pending vs zero vs stale, time-aware workout), `tests/adventure.test.ts` (radius, cost, transport feasibility, window, repeated event, not-interested, weather, learned ranking, bounded feedback, diversity, XP not price-based, expiry, ICS and Ticketmaster parsers, discovery with verified events, source failure fallback, empty window, cache-only offers, unknown ids refused, rating, follow-up to pantry, expiry and exclusion, user quests, readiness reasons). 170 tests in total.
