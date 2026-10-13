# UX audit — 0.4.0 "Organize it"

Goal of this pass: **simpler, faster, clearer, less cluttered, easier to log**. No ranking logic was changed. Nothing deep was removed; it was moved to the tab that owns it. Each item lists the problem, why it mattered, and what changed. Verified by `tests/ux.test.ts` (unit) and a Playwright run at iPhone 14 Pro width (390 px) covering the critical flows (see *Verification*).

## 1. Universal logging

| Problem | Why it matters | Change made |
|---|---|---|
| Logging lived in five places with different shapes: a "Quick log" chip row on Home, per-domain button grids, the Meals page's "Log food", a recipe page "I cooked this" sheet, Workout page. | Users had to remember *where* each thing is logged. The most frequent action (log something) was never in the same place twice. | One floating **+ LOG** button above the bottom nav on every tab (`components/log/LogFab.tsx`). Not a tab. Hidden only during full-screen workflows (`/planner/workout/session`, onboarding, offline). Opens one bottom sheet (`LogSheet.tsx`): **Food · Workout · Sleep · Routine / Habit · More**. |
| The old row was static. | The thing you log most should be first. | Options are ordered by recent use (`lib/logUsage.ts`, localStorage counts; recency dominates, frequency breaks ties, stale use decays). "More" stays last. |
| Workout logging mixed "start a session" and "log one you did". | Different intents, different outcomes (XP rules). | Workout sub-sheet: **Start a session** (or resume if one is active) vs **Log a finished workout**. |
| Steps and Finances cluttered the primary row for everyone. | Daily noise for a monthly or automatic action. | Moved to **More**, along with Sobriety check-in and Workout history. Manual Steps/Sleep appear at the top level only when no automatic source supplies them (see §6). |
| `?log=1` deep link only worked on Home/Fitness. | Manifest shortcuts and notifications pointed at it. | Any page accepts `?log=food|workout|sleep|steps|finance|routine`; the Meals page keeps `?log=1` for its inline logger. |

## 2. Food logging consolidation (highest-frequency action)

| Problem | Why it matters | Change made |
|---|---|---|
| Two food loggers: Home "Meal" (cooked meal only, no macros) and Meals "Log food" (rich). | Logging the same meal in both double-counted cooking; users didn't know which to use. | **One** `FoodLogSheet` (`components/food/log/`), used from + LOG, the Meals screen, the recipe page and the Cooking domain. `MealSheet` and `NutritionLog` deleted. |
| Meal type (Breakfast/Lunch/…) was the first control. | A decision before the real task. | Meal type is **inferred from the clock** (`food/mealType.ts`) and shown as a small editable chip in the sheet header. |
| Tabs appeared after choosing a meal type; Recent was buried inside Search. | Repeat logging is the 80 % case. | Tabs are visible immediately: **Recent · Search · Restaurant · Quick · Estimate · Recipe**. Recent is the default tab when recents exist. One tap selects, one tap confirms (`FoodDraft`). |
| Cooking and nutrition were separate actions. | Logging a cooked recipe took two actions and could pay XP twice. | The draft has an **"I cooked this"** toggle (on by default for recipes). One action writes the nutrition entry *and* the meal row; cooking XP is awarded once (verified). A recipe without macros can still be logged as cooked. |
| Recipe page "I cooked this" opened the old cooked-only sheet; "Log as eaten" was a second button. | Same action, two buttons. | One button → unified sheet pre-filled with the recipe. |
| Quick-add required a name; carbs/fat always shown. | Calories are the only mandatory field. | Quick: calories first (auto-focus), Enter submits; name optional. Draft shows kcal + protein; carbs/fat behind "edit". |
| Estimate with AI off failed with a plain error. | Dead end. | Honest message + **Use Quick add instead**. |
| Deleting an entry asked for confirmation. | Confirmation for a reversible action. | Delete is immediate with an **UNDO** toast (re-logs the entry); XP reversal shown in the toast. |

## 3. Home simplification (HOME = TODAY)

| Problem | Why it matters | Change made |
|---|---|---|
| Home stacked 12 blocks (morning note, Sunday card, special quest, full quest list, plan card, checklist, health cards, quick log, review, domain grid, next rank, achievements), reordered by time of day. | Not readable in 2 seconds; three cards showed today's calories. | New order: **hero → ONE context card → ONE Today card → (+ LOG floats) → compact Progression strip → Next rank**. `app/page.tsx` dropped from 245 to ~100 lines. |
| Several promos competed (morning message, Sunday card, special quest, review). | Attention split. | One context card by priority: special quest › Sunday reset (Sunday/shopping day, unplanned week only) › morning motivation (before 11:00) › wind-down (after 19:00) › weekly review (Mon/Tue). |
| Workout, nutrition, steps, sleep, quests, habits each had their own card. | Six cards to scan. | `home/TodayCard.tsx`: one card, one row each — Workout, Nutrition, Steps, Sleep, Quests, Routines & habits (expands inline to tick off). Rows read "Nutrition · 950 kcal · 73 g protein / 47 g to go" and go quiet when fine ("Protein target hit ✓"). Walk-quest offer lives on the Steps row. |
| Domain grid: 7 tall cards with flavour text, trend and scores. | Scrolling past stats to reach actions. | `home/ProgressionStrip.tsx`: horizontal compact cards "Fitness · B · 82". Detail stays on the domain page. |
| Next rank showed 3 truncated requirement strings. | "What is stopping me?" needs a per-domain answer. | `NextRankCard` lists one NEED per domain below the next floor (biggest weighted gap first) with score / floor, each linking to the domain. Gate notes (tenure) shown separately. |
| Recent achievements and the full quest list duplicated Profile and Quests. | Information ownership. | Removed from Home. Quests tab owns the journal; Profile owns achievements. Only the single promoted special quest can appear on Home. |

## 4. Planner simplification (PLANNER = FUTURE)

| Problem | Why it matters | Change made |
|---|---|---|
| Planner opened with the same "Training & meal plan" dashboard as Home, then a flat tile list, then recent training. | Duplication; the dashboard was "today", not "future". | Sections: **This week** (workouts with a Mon–Sun training-day strip showing done/planned/rest; Meals), **Weekly preparation** (Sunday reset · Groceries · Meal prep with status), **Food** (Pantry · Recipes), **Tools** (Coach · Workout history). `PlanCard` deleted. |
| Groceries and meal prep were only reachable as steps inside the stepper. | Mid-week you go straight to the list. | Tiles deep-link with `?step=shop` / `?step=prep` into the stepper. |

## 5. Information ownership

| Screen | Owns | Moved out |
|---|---|---|
| Home | Today | Quest list → Quests; achievements → Profile; domain detail → domain pages; plan dashboard → Planner |
| Quests | Missions (daily, weekly, special, history) | — |
| Progress | History, analytics, ranks, consistency | Nutrition "logged N of last 30 days" line removed from the Food screen (Progress already has it) |
| Planner | Future | Today's macros (Home / Food screen) |
| Profile | Identity, settings, integrations | — |

## 6. Apple Health vs legacy Oura

| Problem | Why it matters | Change made |
|---|---|---|
| Manual Sleep/Steps visibility depended on `hasOura` flags passed around; Apple Health availability was ignored. | After connecting Apple Health the app still asked for manual sleep. | `health/sources.ts` is the single rule set: a metric is *automatic* only when Apple Health has delivered samples for it (never because it is connected or permitted), or legacy Oura is connected. Manual entry is hidden from quick paths only for covered metrics (unit-tested). |
| Sleep page upsold Oura. | Oura is legacy. | Sleep page shows the active source card ("Sleep from Apple Health") or a Log button plus an Apple Health nudge. HRV/RHR labels no longer say "(Oura)". |
| Connected services listed Oura as a peer. | Confusing primary. | Oura collapsed under **Legacy · Oura direct sync** (expanded only when connected). |

## 7. Mobile interaction

* Tap-target pass: every icon button is ≥44 px (`h-11 w-11`) — edit/delete, options, forget, close, bell, walk offer; chips are 40 px tall. Playwright asserts no interactive element under 40 px on Home.
* Sheets: one modal at a time; closing the food sheet closes the whole log flow (no "back to menu" surprise). Numeric keypads (`inputMode`), `enterKeyHint`, Enter advances fields.
* Safe areas and nav height already handled; `+ LOG` sits above the nav using the same CSS variables.

## 8. Component refactoring (along UX boundaries)

| Before | After |
|---|---|
| `NutritionLog.tsx` (513 lines) | `food/log/`: `FoodLogSheet`, `RecentFoods`, `FoodSearch`, `RestaurantSearch`, `MacroQuickAdd`, `FoodEstimate`, `RecipePicker`, `FoodDraft`, `ConsumedFoodList`, `types` |
| `SessionTracker.tsx` (332) | `planner/session/`: `ActiveWorkoutHeader`, `ExerciseCard`, `SetRow`, `Menus` (ExerciseMenu, AddExerciseSheet, SessionMenu, FinishWorkoutSheet) + a 110-line orchestrator |
| `WeekPlanner.tsx` (507) | `food/week/`: `BudgetStep`, `MealPlanStep`, `GroceryStep` (shopping mode inside `ShoppingList`), `PrepStep`, `LeftoversStep` (+Review), `FinalSteps` (Training, Quests, Ready) + a 90-line orchestrator |
| `PlannerSettings.tsx` (289) | `profile/settings/`: `AiProviderCard`, `TrainingCard`, `NutritionCard`, `RemindersCard` + orchestrator |
| Home page inline logic | `services/today.ts` (`todaySummary`, `todayChecklist`) shared by Home and the + LOG sheet |

## 9. Copy reduction

* Daily rows default to quiet: "Protein target hit ✓", "Done ✓", "Target hit ✓".
* Removed explanatory paragraphs from the Food screen, Sunday steps, session menu ("End early saves what you did…" → labels say it: *End early · keep 3 sets*, *Cancel · nothing counted*, *Discard · erase entirely*).
* Settings cards shortened; reminders list uses one line per toggle.

## 10. Workout tracker speed

* **Copy last** per exercise fills every open set from the previous session (not completed).
* **−/+ steppers** on weight, equipment-aware (`planner/weightStep.ts`: 5 lb barbell/dumbbell, 10 machine, 8 kettlebell, none for bodyweight/bands).
* Completing a set moves focus to the next set's first empty field; Enter in weight → reps → complete. Previous values are placeholders.
* Lifecycle preserved (active · paused · completed · cancelled · discarded); confirm only for Discard.

## 11. UNDO instead of confirm

Confirm dialogs remain only for destructive, history-level actions (discard session, delete history rows, disconnect, reset). Lightweight actions (remove a food entry, undo a special-quest completion) use toasts with **UNDO** (`FeedbackProvider.undoable`).

## Verification

* `npm test`: 128 tests, including `tests/ux.test.ts` (health-source rules, + LOG ordering, meal-type inference, weight steppers).
* Playwright at 390 px: Home comprehension and tap targets; + LOG → Food (restaurant item ≤3 taps, quick macros calories-only, recent select+confirm, estimate fallback, recipe = one action updates nutrition **and** cooking with XP once); Food screen IA and UNDO delete; workout start → stepper → auto-focus → finish (XP), cancel/discard paths (no phantom XP; also covered by `tests/lifecycle.test.ts`); Planner sections; deep link; Sunday card only on Sunday; Sleep page source rules; Connected services legacy Oura.
