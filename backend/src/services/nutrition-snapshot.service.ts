import { Timestamp } from "firebase-admin/firestore";
import type { NutritionalSnapshotDocument } from "../domain/types.js";
import { getMealPlan, recordSnapshot, getSnapshot, listSnapshots, deleteSnapshot } from "../repositories/calories.repo.js";
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
    wellnessImpactScore: computeWellnessImpact(totals, preferences),
    consumedMeals: day.meals.map((meal) => ({
      planId: plan.id,
      mealId: meal.id,
      title: meal.title,
      type: meal.type,
      loggedAt: Timestamp.now(),
      macros: meal.macros,
      micronutrients: meal.micronutrients
    }))
  };

  await recordSnapshot(userId, snapshot);
  return getSnapshot(userId, date);
};

export const getSnapshots = (userId: string, limit = 14) => listSnapshots(userId, limit);

export const logMealConsumption = async (userId: string, planId: string, date: string, mealId: string) => {
  const plan = await getMealPlan(userId, planId);
  if (!plan) throw new Error("Meal plan not found");
  const day = plan.days.find((entry) => entry.date === date);
  if (!day) throw new Error("Day not found");
  const meal = day.meals.find((entry) => entry.id === mealId);
  if (!meal) throw new Error("Meal not found");
  const preferences = await fetchNutritionPreferences(userId);
  if (!preferences) throw new Error("Preferences missing");

  const existing = await getSnapshot(userId, date);
  const consumedMeals = existing?.consumedMeals ?? [];
  const alreadyLogged = consumedMeals.some((entry) => entry.planId === planId && entry.mealId === mealId);
  if (alreadyLogged) {
    return existing;
  }

  const totals = {
    calories: (existing?.totals.calories ?? 0) + meal.macros.calories,
    protein: (existing?.totals.protein ?? 0) + meal.macros.protein,
    carbs: (existing?.totals.carbs ?? 0) + meal.macros.carbs,
    fats: (existing?.totals.fats ?? 0) + meal.macros.fats,
    fiber: existing?.totals.fiber ?? 0,
    vitaminD: (existing?.totals.vitaminD ?? 0) + (meal.micronutrients?.vitaminD ?? 0),
    vitaminB12: (existing?.totals.vitaminB12 ?? 0) + (meal.micronutrients?.vitaminB12 ?? 0),
    iron: (existing?.totals.iron ?? 0) + (meal.micronutrients?.iron ?? 0),
    magnesium: (existing?.totals.magnesium ?? 0) + (meal.micronutrients?.magnesium ?? 0)
  };

  const updatedSnapshot: Omit<NutritionalSnapshotDocument, "id" | "createdAt" | "updatedAt"> = {
    userId,
    date,
    timezone: existing?.timezone ?? preferences.timezone,
    totals,
    goalComparison: {
      calorieDelta: totals.calories - preferences.calorieTarget,
      proteinDelta: totals.protein - preferences.macronutrientTargets.protein,
      carbsDelta: totals.carbs - preferences.macronutrientTargets.carbs,
      fatsDelta: totals.fats - preferences.macronutrientTargets.fats
    },
    wellnessImpactScore: computeWellnessImpact(totals, preferences),
    consumedMeals: [
      ...consumedMeals,
      {
        planId,
        mealId,
        title: meal.title,
        type: meal.type,
        loggedAt: Timestamp.now(),
        macros: meal.macros,
        micronutrients: meal.micronutrients
      }
    ]
  };

  await recordSnapshot(userId, updatedSnapshot, { merge: false });
  return getSnapshot(userId, date);
};

export const unlogMealConsumption = async (userId: string, planId: string, date: string, mealId: string) => {
  const existing = await getSnapshot(userId, date);
  if (!existing || !existing.consumedMeals?.length) {
    return existing;
  }
  const entry = existing.consumedMeals.find((item) => item.planId === planId && item.mealId === mealId);
  if (!entry) {
    return existing;
  }
  const remainingMeals = existing.consumedMeals.filter(
    (item) => !(item.planId === planId && item.mealId === mealId)
  );

  const totals = {
    calories: Math.max(0, existing.totals.calories - entry.macros.calories),
    protein: Math.max(0, existing.totals.protein - entry.macros.protein),
    carbs: Math.max(0, existing.totals.carbs - entry.macros.carbs),
    fats: Math.max(0, existing.totals.fats - entry.macros.fats),
    fiber: Math.max(0, existing.totals.fiber - (entry.micronutrients?.fiber ?? 0)),
    vitaminD: Math.max(0, existing.totals.vitaminD - (entry.micronutrients?.vitaminD ?? 0)),
    vitaminB12: Math.max(0, existing.totals.vitaminB12 - (entry.micronutrients?.vitaminB12 ?? 0)),
    iron: Math.max(0, existing.totals.iron - (entry.micronutrients?.iron ?? 0)),
    magnesium: Math.max(0, existing.totals.magnesium - (entry.micronutrients?.magnesium ?? 0))
  };

  if (!remainingMeals.length) {
    await deleteSnapshot(userId, date);
    return null;
  }

  const preferences = await fetchNutritionPreferences(userId);
  if (!preferences) throw new Error("Preferences missing");

  const updatedSnapshot: Omit<NutritionalSnapshotDocument, "id" | "createdAt" | "updatedAt"> = {
    userId,
    date,
    timezone: existing.timezone,
    totals,
    goalComparison: {
      calorieDelta: totals.calories - preferences.calorieTarget,
      proteinDelta: totals.protein - preferences.macronutrientTargets.protein,
      carbsDelta: totals.carbs - preferences.macronutrientTargets.carbs,
      fatsDelta: totals.fats - preferences.macronutrientTargets.fats
    },
    wellnessImpactScore: computeWellnessImpact(totals, preferences),
    consumedMeals: remainingMeals
  };

  await recordSnapshot(userId, updatedSnapshot, { merge: false });
  return getSnapshot(userId, date);
};

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
