import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { profiles, type Profile } from "@/db/schema";
import { parseJson, toJson } from "@/lib/json";
import { todayInTz, timeInTz, type ISODate } from "@/lib/dates";
import { DOMAIN_IDS, type DomainId } from "@/ranking/types";

export interface Targets {
  stepsTarget: number;
  bedtimeTarget: string | null; // "23:00"
  sleepTargetMin: number;
  workoutsPerWeekTarget: number;
  mealsPerWeekTarget: number;
}

export interface Baseline {
  workoutsPerWeek?: number | null;
  exerciseTypes?: string[] | null;
  stepsPerDay?: number | null;
  avgSleepHours?: number | null;
  consistentSchedule?: boolean | null;
  mealsCookedPerWeek?: number | null;
  skincareDaysPerWeek?: number | null;
}

export const DEFAULT_TARGETS: Targets = {
  stepsTarget: 7500,
  bedtimeTarget: "23:00",
  sleepTargetMin: 450,
  workoutsPerWeekTarget: 3,
  mealsPerWeekTarget: 7,
};

export interface ProfileView extends Omit<Profile, "activeDomains" | "targets" | "baseline"> {
  activeDomains: DomainId[];
  targets: Targets;
  baseline: Baseline;
  today: ISODate;
  localTime: string;
  onboarded: boolean;
}

export function getProfile(): ProfileView {
  const db = getDb();
  let row = db.select().from(profiles).limit(1).get();
  if (!row) {
    db.insert(profiles).values({ name: "Adventurer" }).run();
    row = db.select().from(profiles).limit(1).get()!;
  }
  return toView(row);
}

export function toView(row: Profile): ProfileView {
  const timezone = row.timezone || "UTC";
  const active = parseJson<string[]>(row.activeDomains, [...DOMAIN_IDS]).filter((d): d is DomainId =>
    (DOMAIN_IDS as readonly string[]).includes(d),
  );
  return {
    ...row,
    timezone,
    activeDomains: active,
    targets: { ...DEFAULT_TARGETS, ...parseJson<Partial<Targets>>(row.targets, {}) },
    baseline: parseJson<Baseline>(row.baseline, {}),
    today: todayInTz(timezone),
    localTime: timeInTz(timezone),
    onboarded: !!row.onboardingCompletedAt,
  };
}

export interface ProfileUpdate {
  name?: string;
  equippedTitle?: string | null;
  age?: number | null;
  sex?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  timezone?: string;
  activeDomains?: DomainId[];
  targets?: Partial<Targets>;
  baseline?: Partial<Baseline>;
  goals?: string | null;
  onboardingCompletedAt?: string | null;
}

export function updateProfile(patch: ProfileUpdate): ProfileView {
  const db = getDb();
  const current = getProfile();
  const values: Partial<typeof profiles.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.equippedTitle !== undefined) values.equippedTitle = patch.equippedTitle;
  if (patch.age !== undefined) values.age = patch.age;
  if (patch.sex !== undefined) values.sex = patch.sex;
  if (patch.heightCm !== undefined) values.heightCm = patch.heightCm;
  if (patch.weightKg !== undefined) values.weightKg = patch.weightKg;
  if (patch.timezone !== undefined) values.timezone = patch.timezone;
  if (patch.goals !== undefined) values.goals = patch.goals;
  if (patch.onboardingCompletedAt !== undefined) values.onboardingCompletedAt = patch.onboardingCompletedAt;
  if (patch.activeDomains !== undefined) values.activeDomains = toJson(patch.activeDomains);
  if (patch.targets !== undefined) values.targets = toJson({ ...current.targets, ...patch.targets });
  if (patch.baseline !== undefined) values.baseline = toJson({ ...current.baseline, ...patch.baseline });
  db.update(profiles).set(values).where(eq(profiles.id, current.id)).run();
  return getProfile();
}
