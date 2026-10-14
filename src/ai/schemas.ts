import { z } from "zod";

/**
 * Strict contracts for everything the AI is allowed to return. Raw model output
 * is parsed through these before it touches the database or the UI.
 */
export const WorkoutPlanSchema = z.object({
  name: z.string().min(2).max(60),
  focus: z.enum(["upper", "lower", "full", "push", "pull", "legs", "conditioning", "recovery"]).default("full"),
  goal: z.string().max(40).default("general"),
  estimatedMinutes: z.number().int().min(10).max(120),
  rationale: z.string().max(400).default(""),
  exercises: z
    .array(
      z.object({
        name: z.string().min(2).max(60),
        sets: z.number().int().min(1).max(6),
        repRange: z.string().min(1).max(20),
        restSeconds: z.number().int().min(0).max(300).default(90),
        notes: z.string().max(160).optional().default(""),
      }),
    )
    .min(2)
    .max(9),
  bonusQuest: z
    .object({ title: z.string().max(80), description: z.string().max(160).default(""), minutes: z.number().int().min(5).max(30), xp: z.number().int().min(15).max(40) })
    .nullable()
    .optional(),
});
export type AiWorkoutPlan = z.infer<typeof WorkoutPlanSchema>;

export const MealPlanSchema = z.object({
  calorieTarget: z.number().int().min(1000).max(6000),
  proteinTarget: z.number().int().min(30).max(400),
  rationale: z.string().max(400).default(""),
  meals: z
    .array(
      z.object({
        mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
        name: z.string().min(2).max(80),
        calories: z.number().int().min(50).max(2000),
        protein: z.number().int().min(0).max(200),
        carbs: z.number().int().min(0).max(300),
        fat: z.number().int().min(0).max(150),
        ingredients: z.array(z.string().max(60)).max(20).default([]),
        notes: z.string().max(160).optional().default(""),
      }),
    )
    .min(2)
    .max(6),
});
export type AiMealPlan = z.infer<typeof MealPlanSchema>;

export const QuestCandidateSchema = z.object({
  title: z.string().min(4).max(80),
  description: z.string().max(160).default(""),
  domain: z.enum(["fitness", "sleep", "cooking", "wealth", "skincare", "sobriety", "habits"]),
  difficulty: z.enum(["common", "uncommon", "rare"]),
  estimatedMinutes: z.number().int().min(0).max(90),
  xpReward: z.number().int().min(15).max(100),
  kind: z.enum(["special", "side", "recovery", "social", "discipline", "bonus"]).default("special"),
});
export type AiQuestCandidate = z.infer<typeof QuestCandidateSchema>;

export const CoachReplySchema = z.object({
  reply: z.string().min(1).max(1500),
  suggestions: z.array(z.string().max(80)).max(4).default([]),
});
export type AiCoachReply = z.infer<typeof CoachReplySchema>;

export const WeeklyReviewNoteSchema = z.object({
  headline: z.string().max(80),
  note: z.string().max(600),
  focus: z.string().max(120),
});

/** Nutrition estimate for a described meal. Always presented as an ESTIMATE in the UI. */
export const FoodEstimateSchema = z.object({
  name: z.string().min(2).max(80),
  calories: z.number().int().min(10).max(4000),
  protein: z.number().int().min(0).max(300),
  carbs: z.number().int().min(0).max(500),
  fat: z.number().int().min(0).max(300),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  assumptions: z.string().max(240).default(""),
});
export type AiFoodEstimate = z.infer<typeof FoodEstimateSchema>;

const IngredientQty = z.object({ name: z.string().min(1).max(60), qty: z.number().min(0).max(100).default(1), unit: z.string().max(20).default("each") });

/** A recipe suggested from what is on hand. */
export const RecipeSuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string().min(2).max(80),
        calories: z.number().int().min(50).max(2000),
        protein: z.number().int().min(0).max(200),
        carbs: z.number().int().min(0).max(300),
        fat: z.number().int().min(0).max(150),
        prepMinutes: z.number().int().min(2).max(120),
        uses: z.array(z.string().max(60)).min(1).max(15),
        additional: z.array(z.string().max(60)).max(6).default([]),
        steps: z.array(z.string().max(200)).max(8).default([]),
        why: z.string().max(160).default(""),
      }),
    )
    .min(1)
    .max(4),
});
export type AiRecipeSuggestions = z.infer<typeof RecipeSuggestionSchema>;

/** A week of meals + consolidated shopping list + prep plan. */
export const WeeklyPlanSchema = z.object({
  rationale: z.string().max(500).default(""),
  days: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        meals: z
          .array(
            z.object({
              mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
              name: z.string().min(2).max(80),
              calories: z.number().int().min(50).max(2000),
              protein: z.number().int().min(0).max(200),
              carbs: z.number().int().min(0).max(300),
              fat: z.number().int().min(0).max(150),
              ingredients: z.array(IngredientQty).max(15).default([]),
              prepMinutes: z.number().int().min(0).max(120).default(15),
              prepAhead: z.boolean().default(false),
            }),
          )
          .max(6),
      }),
    )
    .min(1)
    .max(7),
  shoppingList: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        category: z.enum(["produce", "protein", "dairy", "grains", "frozen", "pantry", "other"]).default("other"),
        qty: z.number().min(0).max(100),
        unit: z.string().max(20).default("each"),
        estPrice: z.number().min(0).max(200).nullable().default(null),
        usedIn: z.array(z.string().max(80)).max(20).default([]),
      }),
    )
    .max(60),
  prepPlan: z.array(z.object({ name: z.string().max(60), servings: z.number().int().min(1).max(30), minutes: z.number().int().min(1).max(180), supports: z.array(z.string().max(80)).max(10).default([]) })).max(12).default([]),
});
export type AiWeeklyPlan = z.infer<typeof WeeklyPlanSchema>;

/** Replacement meals for the rest of today after an unplanned meal. */
export const DayAdjustSchema = z.object({
  meals: z
    .array(
      z.object({
        replacesSlot: z.number().int().min(0).max(10),
        name: z.string().min(2).max(80),
        calories: z.number().int().min(50).max(2000),
        protein: z.number().int().min(0).max(200),
        carbs: z.number().int().min(0).max(300),
        fat: z.number().int().min(0).max(150),
        ingredients: z.array(z.string().max(60)).max(15).default([]),
        notes: z.string().max(160).default(""),
      }),
    )
    .min(1)
    .max(4),
  rationale: z.string().max(240).default(""),
});

/** AI frames verified events; it may only reference ids we gave it. Facts are rebuilt from the cache. */
export const EventQuestFramingSchema = z.object({
  picks: z
    .array(
      z.object({
        eventId: z.number().int(),
        title: z.string().min(4).max(60),
        description: z.string().min(10).max(180),
        why: z.string().max(140).default(""),
      }),
    )
    .min(1)
    .max(4),
});
export type AiEventQuestFraming = z.infer<typeof EventQuestFramingSchema>;

/** Optional "AI enhance" for a user-written quest. Ordinary things stay ordinary. */
export const UserQuestEnhanceSchema = z.object({
  title: z.string().min(3).max(60),
  description: z.string().max(160).default(""),
  domain: z.enum(["fitness", "sleep", "cooking", "wealth", "skincare", "sobriety", "habits"]),
  xpReward: z.number().int().min(15).max(60),
  estimatedMinutes: z.number().int().min(0).max(240),
});
export type AiUserQuestEnhance = z.infer<typeof UserQuestEnhanceSchema>;
