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
