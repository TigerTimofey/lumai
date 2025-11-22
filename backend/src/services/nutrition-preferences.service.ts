import { Timestamp } from "firebase-admin/firestore";
import type { HealthProfileDocument, NutritionPreferencesDocument, UserDocument } from "../domain/types.js";
import { getNutritionPreferences, upsertNutritionPreferences } from "../repositories/calories.repo.js";
import { getUserById } from "../repositories/user.repo.js";
import { getProfile } from "../repositories/profile.repo.js";

const DEFAULT_TIMEZONE = "UTC";

const DEFAULT_MACROS = {
  protein: 120,
  carbs: 200,
  fats: 60
};

const toNumber = (value: unknown, fallback?: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback ?? 0;
};

export const fetchNutritionPreferences = async (userId: string) => {
  const [existing, user, profile] = await Promise.all([
    getNutritionPreferences(userId),
    getUserById(userId),
    getProfile(userId)
  ]);
  const derivedTarget = deriveCalorieTarget(user, profile);
  if (existing) {
    if (Math.abs(existing.calorieTarget - derivedTarget) >= 50) {
      return upsertNutritionPreferences(userId, {
        ...existing,
        calorieTarget: derivedTarget
      });
    }
    return existing;
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? DEFAULT_TIMEZONE;

  const fallback: Omit<NutritionPreferencesDocument, "userId" | "createdAt" | "updatedAt"> = {
    timezone,
    dietaryPreferences: [],
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
    cuisinePreferences: [],
    calorieTarget: derivedTarget,
    macronutrientTargets: DEFAULT_MACROS,
    micronutrientTargets: {
      vitaminD: 20,
      vitaminB12: 2.5,
      iron: 18,
      magnesium: 420
    },
    mealsPerDay: 3,
    preferredMealTimes: {
      breakfast: new Date().toISOString(),
      lunch: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      dinner: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()
    }
  };

  return upsertNutritionPreferences(userId, fallback);
};

export const updateNutritionPreferences = async (userId: string, updates: Partial<NutritionPreferencesDocument>) => {
  const current = await fetchNutritionPreferences(userId);
  const merged = {
    ...current,
    ...updates,
    macronutrientTargets: {
      ...current.macronutrientTargets,
      ...updates.macronutrientTargets
    },
    micronutrientTargets: {
      ...current.micronutrientTargets,
      ...updates.micronutrientTargets
    },
    preferredMealTimes: {
      ...current.preferredMealTimes,
      ...updates.preferredMealTimes
    },
    updatedAt: Timestamp.now()
  } as NutritionPreferencesDocument;
  return upsertNutritionPreferences(userId, merged);
};

const resolveActivityLevel = (user: UserDocument | null, profile: HealthProfileDocument | null) => {
  const required = (user?.requiredProfile ?? {}) as Record<string, unknown>;
  const lifestyle = profile?.current?.lifestyle ?? {};
  const activity =
    (typeof required.activityLevel === "string" ? required.activityLevel : null) ??
    (typeof lifestyle.activityLevel === "string" ? lifestyle.activityLevel : null) ??
    "moderate";
  return activity;
};

const deriveCalorieTarget = (user: UserDocument | null, profile: HealthProfileDocument | null) => {
  const required = (user?.requiredProfile ?? {}) as Record<string, unknown>;
  const normalized = profile?.current?.normalized ?? {};
  const goals = profile?.current?.goals ?? {};
  const activity = resolveActivityLevel(user, profile);
  const weight = toNumber(normalized.weightKg ?? required.weight, 70);
  const heightCm = toNumber(normalized.heightCm ?? required.height, 170);
  const heightM = heightCm / 100 || 1.7;
  const bmi = normalized.bmi ?? weight / (heightM * heightM);
  let multiplier = 13;
  if (["high", "active", "very_active", "extra_active"].includes(activity)) {
    multiplier = 15;
  } else if (["sedentary", "low", "light"].includes(activity)) {
    multiplier = 11;
  }
  let target = weight * multiplier;
  const bmiAdjustment = bmi >= 27 ? -225 : bmi <= 19 ? 180 : 0;
  target += bmiAdjustment;

  const rawTargetWeight =
    typeof goals.targetWeightKg === "number"
      ? goals.targetWeightKg
      : toNumber(
          (required as Record<string, unknown>).targetWeight ??
            (user?.additionalProfile as Record<string, unknown> | undefined)?.targetWeight,
          NaN
        );
  if (Number.isFinite(rawTargetWeight) && weight) {
    const diff = rawTargetWeight - weight;
    if (Math.abs(diff) > 1) {
      const direction = diff > 0 ? 1 : -1;
      const magnitude = Math.min(Math.abs(diff) * 12, 300);
      target += direction * magnitude;
    }
  }

  return Math.max(1200, Math.round(target));
};
