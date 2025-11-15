import { Timestamp } from "firebase-admin/firestore";
import type { NutritionPreferencesDocument } from "../domain/types.js";
import { getNutritionPreferences, upsertNutritionPreferences } from "../repositories/calories.repo.js";
import { getUserById } from "../repositories/user.repo.js";

const DEFAULT_TIMEZONE = "UTC";

const DEFAULT_MACROS = {
  protein: 120,
  carbs: 200,
  fats: 60
};

export const fetchNutritionPreferences = async (userId: string) => {
  const existing = await getNutritionPreferences(userId);
  if (existing) return existing;

  const user = await getUserById(userId);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? DEFAULT_TIMEZONE;

  const fallback: Omit<NutritionPreferencesDocument, "userId" | "createdAt" | "updatedAt"> = {
    timezone,
    dietaryPreferences: [],
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
    cuisinePreferences: [],
    calorieTarget: deriveCalorieTarget(user?.requiredProfile ?? null),
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

const deriveCalorieTarget = (requiredProfile: Record<string, unknown> | null | undefined) => {
  const weight = Number(requiredProfile?.weight ?? 70);
  const heightCm = Number(requiredProfile?.height ?? 170);
  const heightM = heightCm / 100;
  const bmi = heightM > 0 ? weight / (heightM * heightM) : 22;
  const activity = (requiredProfile?.activityLevel as string) ?? "moderate";
  let multiplier = 13;
  if (activity === "high") multiplier = 15;
  if (activity === "low") multiplier = 11;
  const bmiAdjustment = bmi > 25 ? -150 : bmi < 20 ? 200 : 0;
  return Math.max(1200, Math.round(weight * multiplier + bmiAdjustment));
};
