import type { NutritionalSnapshotDocument } from "../domain/types.js";
import { getMealPlan, recordSnapshot, getSnapshot, listSnapshots } from "../repositories/calories.repo.js";
import { fetchNutritionPreferences } from "./nutrition-preferences.service.js";

export const createSnapshotFromPlan = async (userId: string, planId: string, date: string) => {
  const plan = await getMealPlan(userId, planId);
  if (!plan) throw new Error("Meal plan not found");
  const preferences = await fetchNutritionPreferences(userId);
  const day = plan.days.find((entry) => entry.date === date);
  if (!day) throw new Error("Day not found");
  const totals = day.meals.reduce(
    (acc, meal) => {
      acc.calories += meal.macros.calories;
      acc.protein += meal.macros.protein;
      acc.carbs += meal.macros.carbs;
      acc.fats += meal.macros.fats;
      if (meal.micronutrients) {
        acc.vitaminD += meal.micronutrients.vitaminD ?? 0;
        acc.vitaminB12 += meal.micronutrients.vitaminB12 ?? 0;
        acc.iron += meal.micronutrients.iron ?? 0;
        acc.magnesium += meal.micronutrients.magnesium ?? 0;
      }
      return acc;
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
      vitaminD: 0,
      vitaminB12: 0,
      iron: 0,
      magnesium: 0
    }
  );

  const snapshot: Omit<NutritionalSnapshotDocument, "id" | "createdAt" | "updatedAt"> = {
    userId,
    date,
    timezone: preferences.timezone,
    totals,
    goalComparison: {
      calorieDelta: totals.calories - preferences.calorieTarget,
      proteinDelta: totals.protein - preferences.macronutrientTargets.protein,
      carbsDelta: totals.carbs - preferences.macronutrientTargets.carbs,
      fatsDelta: totals.fats - preferences.macronutrientTargets.fats
    },
    wellnessImpactScore: computeWellnessImpact(totals, preferences)
  };

  await recordSnapshot(userId, snapshot);
  return getSnapshot(userId, date);
};

export const getSnapshots = (userId: string, limit = 14) => listSnapshots(userId, limit);

const computeWellnessImpact = (
  totals: NutritionalSnapshotDocument["totals"],
  preferences: Awaited<ReturnType<typeof fetchNutritionPreferences>>
) => {
  const deficit = Math.abs(totals.calories - preferences.calorieTarget);
  const macroVariance =
    Math.abs(totals.protein - preferences.macronutrientTargets.protein) +
    Math.abs(totals.carbs - preferences.macronutrientTargets.carbs) +
    Math.abs(totals.fats - preferences.macronutrientTargets.fats);
  const penalty = deficit / 200 + macroVariance / 150;
  return Math.max(0, 100 - penalty);
};
