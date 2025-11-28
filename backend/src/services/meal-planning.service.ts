import { randomUUID } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import type {
  MealPlanDocument,
  MealPlanMeal,
  NutritionPreferencesDocument,
  RecipeDocument
} from "../domain/types.js";
import {
  createMealPlan,
  getMealPlan,
  getMealPlanVersion,
  listMealPlanVersions,
  listMealPlans,
  replaceMealPlan,
  saveMealPlanVersion,
  updateMealPlan
} from "../repositories/calories.repo.js";
import { fetchNutritionPreferences } from "./nutrition-preferences.service.js";
import { searchRecipes, getRecipe as getRecipeDocument } from "./nutrition-rag.service.js";
import { calculateNutritionForRecipe } from "./nutrition-functions.service.js";
import { orchestrateMealPlan } from "./meal-planning-orchestrator.service.js";
import { FALLBACK_RECIPES } from "../data/fallback-recipes.js";
import { badRequest, notFound, serviceUnavailable } from "../utils/api-error.js";
import { getProfile } from "../repositories/profile.repo.js";
import { buildHealthAwareRecipeFilters } from "../utils/recipe-filters.js";
import { unlogMealConsumption } from "./nutrition-snapshot.service.js";

interface GeneratePlanOptions {
  duration: "daily" | "weekly";
  startDate: string;
}

const DEFAULT_MEAL_TYPES = ["breakfast", "lunch", "dinner"];

const buildMealPlanDocument = async (
  userId: string,
  options: GeneratePlanOptions,
  planId: string = randomUUID(),
  versionOverride?: number
) => {
  const [preferences, profile] = await Promise.all([
    fetchNutritionPreferences(userId),
    getProfile(userId)
  ]);
  const version = versionOverride ?? Date.now();

  let aiPlan;
  try {
    aiPlan = await orchestrateMealPlan(userId, options.duration, options.startDate);
  } catch (error) {
    console.warn("[meal-planning] AI orchestrator failed, using fallback", error);
  }

  let fallbackRecipes: RecipeDocument[] = [];
  if (!aiPlan) {
    const searchResults = await searchRecipes(
      buildHealthAwareRecipeFilters(preferences, profile, {
        query: "balanced nutrition plan",
        limit: 30
      })
    );
    fallbackRecipes = searchResults.map((entry) => entry.recipe);
    if (!fallbackRecipes.length) {
      fallbackRecipes = FALLBACK_RECIPES;
    }
  }

  const fallbackRecipeDocs = fallbackRecipes.length ? fallbackRecipes : FALLBACK_RECIPES;

  const days = aiPlan?.days ?? buildFallbackDays(options, preferences, fallbackRecipeDocs);
  const planMetrics = buildMealPlanMetrics(days, preferences);

  if (!days.length) {
    throw serviceUnavailable("Failed to build meal plan days");
  }

  return {
    id: planId,
    userId,
    duration: options.duration,
    startDate: days[0]?.date ?? options.startDate,
    endDate: days[days.length - 1]?.date ?? options.startDate,
    timezone: preferences.timezone,
    version,
    status: "active",
    strategySummary: aiPlan?.strategySummary ?? buildStrategySummary(preferences),
    analysis: aiPlan?.analysis,
    nutritionalBalanceScore: planMetrics.nutritionalBalanceScore,
    diversityIndex: planMetrics.diversityIndex,
    micronutrientCoverage: planMetrics.micronutrientCoverage,
    weeklyTrends: planMetrics.weeklyTrends,
    sustainabilityMetrics: planMetrics.sustainabilityMetrics,
    ragReferences:
      aiPlan?.ragReferences ??
      fallbackRecipeDocs.slice(0, 5).map((recipe) => recipe.id),
    days,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  } satisfies MealPlanDocument;
};

const buildFallbackDays = (
  options: GeneratePlanOptions,
  preferences: NutritionPreferencesDocument,
  recipes: RecipeDocument[]
) => {
  const daysCount = options.duration === "weekly" ? 7 : 1;
  return Array.from({ length: daysCount }).map((_, index) => {
    const date = new Date(options.startDate);
    date.setDate(date.getDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      meals: buildMealsForDay(date, preferences, recipes)
    };
  });
};

export const generateMealPlan = async (userId: string, options: GeneratePlanOptions) => {
  const planDoc = await buildMealPlanDocument(userId, options);
  await createMealPlan(userId, planDoc);
  const storedPlan = await getMealPlan(userId, planDoc.id);
  if (storedPlan) {
    await saveMealPlanVersion(userId, storedPlan);
    return storedPlan;
  }
  return planDoc;
};

export const listUserMealPlans = (userId: string, limit = 5) => listMealPlans(userId, limit);

export const regenerateMealPlan = async (userId: string, planId: string) => {
  const existing = await getMealPlan(userId, planId);
  if (!existing) {
    throw notFound("Meal plan not found");
  }
  const regenerated = await buildMealPlanDocument(userId, {
    duration: existing.duration,
    startDate: existing.startDate
  }, planId, existing.version + 1);
  const payload: MealPlanDocument = {
    ...regenerated,
    version: existing.version + 1,
    createdAt: existing.createdAt,
    updatedAt: Timestamp.now()
  };
  await replaceMealPlan(userId, payload);
  await saveMealPlanVersion(userId, payload);
  return payload;
};

export const regenerateMeal = async (
  userId: string,
  planId: string,
  date: string,
  mealId: string,
  options?: { micronutrientFocus?: keyof RecipeDocument["micronutrientsPerServing"]; recipeId?: string }
) => {
  const plan = await getMealPlan(userId, planId);
  if (!plan) throw notFound("Meal plan not found");
  const [preferences, profile] = await Promise.all([
    fetchNutritionPreferences(userId),
    getProfile(userId)
  ]);
  const day = plan.days.find((entry) => entry.date === date);
  if (!day) throw badRequest("Day not found in plan");
  const mealIndex = day.meals.findIndex((meal) => meal.id === mealId);
  if (mealIndex === -1) throw badRequest("Meal not found");
  let replacementRecipe: RecipeDocument | null = null;
  if (options?.recipeId) {
    replacementRecipe = await getRecipeDocument(options.recipeId);
    if (!replacementRecipe) {
      throw notFound("Recipe not found");
    }
  } else {
    const ragResults = await searchRecipes(
      buildHealthAwareRecipeFilters(preferences, profile, {
        query: "healthy meal substitution",
        limit: 5,
        micronutrientFocus: options?.micronutrientFocus
      })
    );
    replacementRecipe = ragResults[0]?.recipe ?? FALLBACK_RECIPES[0];
  }
  if (!replacementRecipe) throw serviceUnavailable("Unable to find alternative recipe");
  const nutrition = calculateNutritionForRecipe(replacementRecipe, replacementRecipe.servings);
  day.meals[mealIndex] = {
    ...day.meals[mealIndex],
    title: replacementRecipe.title,
    recipeId: replacementRecipe.id,
    servings: replacementRecipe.servings,
    macros: {
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fats: nutrition.fats
    },
    micronutrients: nutrition.micronutrients,
    metadata: {
      prepTimeMin: replacementRecipe.prepTimeMin,
      cookTimeMin: replacementRecipe.cookTimeMin
    },
    aiContext: {
      recipeStep: "regenerated meal with RAG context"
    }
  };
  await updateMealPlan(userId, planId, { days: plan.days });
  return getMealPlan(userId, planId);
};

export const swapMeals = async (userId: string, planId: string, sourceDate: string, sourceMealId: string, targetDate: string, targetMealId: string) => {
  const plan = await getMealPlan(userId, planId);
  if (!plan) throw notFound("Meal plan not found");
  const sourceDay = plan.days.find((entry) => entry.date === sourceDate);
  const targetDay = plan.days.find((entry) => entry.date === targetDate);
  if (!sourceDay || !targetDay) throw badRequest("Day not found in selected plan");
  const sourceIndex = sourceDay.meals.findIndex((meal) => meal.id === sourceMealId);
  const targetIndex = targetDay.meals.findIndex((meal) => meal.id === targetMealId);
  if (sourceIndex === -1 || targetIndex === -1) throw badRequest("Meal not found");
  const temp = sourceDay.meals[sourceIndex];
  sourceDay.meals[sourceIndex] = targetDay.meals[targetIndex];
  targetDay.meals[targetIndex] = temp;
  await updateMealPlan(userId, planId, { days: plan.days });
  return getMealPlan(userId, planId);
};

export const listMealPlanVersionsForUser = (userId: string, planId: string, limit = 10) =>
  listMealPlanVersions(userId, planId, limit);

export const restoreMealPlanVersion = async (userId: string, planId: string, version: number) => {
  const currentPlan = await getMealPlan(userId, planId);
  const versionDoc = await getMealPlanVersion(userId, planId, version);
  if (!versionDoc) {
    throw notFound("Meal plan version not found");
  }
  if (currentPlan && currentPlan.version !== version) {
    await saveMealPlanVersion(userId, currentPlan);
  }
  const { storedAt: _storedAt, sourceVersion: _sourceVersion, ...snapshot } = versionDoc;
  const restoredPlan: MealPlanDocument = {
    ...snapshot,
    restoredFromVersion: snapshot.restoredFromVersion,
    updatedAt: Timestamp.now()
  };
  await replaceMealPlan(userId, restoredPlan);
  return restoredPlan;
};

export const addManualMeal = async (
  userId: string,
  planId: string,
  date: string,
  payload: Pick<MealPlanMeal, "title" | "type" | "scheduledAt" | "macros" | "micronutrients">
) => {
  const plan = await getMealPlan(userId, planId);
  if (!plan) throw notFound("Meal plan not found");
  const day = plan.days.find((entry) => entry.date === date);
  if (!day) throw badRequest("Selected date is outside of the meal plan range");
  day.meals.push({
    id: randomUUID(),
    recipeId: undefined,
    servings: 1,
    ...payload
  });
  await updateMealPlan(userId, planId, { days: plan.days });
  return getMealPlan(userId, planId);
};

export const generateMealAlternatives = async (
  userId: string,
  query: string,
  micronutrientFocus?: keyof RecipeDocument["micronutrientsPerServing"]
) => {
  const [preferences, profile] = await Promise.all([
    fetchNutritionPreferences(userId),
    getProfile(userId)
  ]);
  const results = await searchRecipes(
    buildHealthAwareRecipeFilters(preferences, profile, {
      query,
      limit: 5,
      micronutrientFocus
    })
  );
  return results.map((entry) => entry.recipe);
};

const buildMealsForDay = (date: Date, preferences: NutritionPreferencesDocument, recipes: RecipeDocument[]) => {
  if (!recipes.length) {
    return [];
  }
  const mealTypes =
    preferences.mealsPerDay > DEFAULT_MEAL_TYPES.length
      ? [...DEFAULT_MEAL_TYPES, "snack"]
      : DEFAULT_MEAL_TYPES.slice(0, preferences.mealsPerDay);
  const meals: MealPlanMeal[] = [];
  mealTypes.forEach((type, index) => {
    const recipe = recipes[(index + date.getDate()) % recipes.length];
    if (!recipe) {
      return;
    }
    const nutrition = calculateNutritionForRecipe(recipe, recipe.servings);
    meals.push({
      id: randomUUID(),
      type,
      title: recipe.title,
      recipeId: recipe.id,
      servings: recipe.servings,
      scheduledAt: deriveMealTime(preferences, type, date),
      macros: {
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fats: nutrition.fats
      },
      micronutrients: nutrition.micronutrients,
      aiContext: {
        strategyStep: buildStrategySummary(preferences),
        structureStep: `Structured meal for ${type}`,
        recipeStep: `RAG reference ${recipe.id}`
      }
    });
  });
  return meals;
};

const deriveMealTime = (preferences: NutritionPreferencesDocument, mealType: string, date: Date) => {
  const preferred = preferences.preferredMealTimes[mealType];
  if (preferred) return preferred;
  const copy = new Date(date);
  copy.setHours(mealType === "breakfast" ? 8 : mealType === "lunch" ? 13 : 20);
  return copy.toISOString();
};

const buildStrategySummary = (preferences: NutritionPreferencesDocument) => {
  return [
    `Timezone: ${preferences.timezone}`,
    `Dietary focus: ${preferences.dietaryPreferences.join(", ") || "balanced"}`,
    `Allergens avoided: ${preferences.allergies.join(", ") || "none"}`,
    `Calories target: ${preferences.calorieTarget} kcal`
  ].join(" · ");
};

const buildMealPlanMetrics = (days: MealPlanDocument["days"], preferences: NutritionPreferencesDocument) => {
  const meals = days.flatMap((day) => day.meals);
  const totals = meals.reduce(
    (acc, meal) => {
      acc.calories += meal.macros.calories;
      acc.protein += meal.macros.protein;
      acc.carbs += meal.macros.carbs;
      acc.fats += meal.macros.fats;
      acc.fiber += meal.micronutrients?.fiber ?? 0;
      acc.vitaminD += meal.micronutrients?.vitaminD ?? 0;
      acc.vitaminB12 += meal.micronutrients?.vitaminB12 ?? 0;
      acc.iron += meal.micronutrients?.iron ?? 0;
      acc.magnesium += meal.micronutrients?.magnesium ?? 0;
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

  const dayCount = Math.max(days.length, 1);
  const averageCalories = totals.calories / dayCount;
  const calorieDelta = Math.abs(averageCalories - preferences.calorieTarget);
  const macroTargets = preferences.macronutrientTargets;
  const macroVariance =
    Math.abs(totals.protein / dayCount - macroTargets.protein) +
    Math.abs(totals.carbs / dayCount - macroTargets.carbs) +
    Math.abs(totals.fats / dayCount - macroTargets.fats);
  const nutritionalBalanceScore = Math.max(0, Math.round(100 - calorieDelta / 5 - macroVariance / 3));

  const uniqueMeals = new Set(meals.map((meal) => meal.recipeId ?? meal.title));
  const diversityIndex = meals.length
    ? Math.round(Math.min(1, uniqueMeals.size / meals.length) * 100)
    : 0;

  const targets = preferences.micronutrientTargets ?? {};
  const coverageEntries = Object.entries(targets).map(([key, target]) => {
    const achieved = totals[key as keyof typeof totals] ?? 0;
    const coverage = target ? achieved / target : 0;
    return { key, coverage };
  });
  const coveragePercentage = coverageEntries.length
    ? Math.round(
        Math.min(
          1.5,
          coverageEntries.reduce((sum, entry) => sum + entry.coverage, 0) / coverageEntries.length
        ) * 100
      )
    : 0;
  const deficiencies = coverageEntries
    .filter((entry) => entry.coverage < 0.8)
    .map((entry) => entry.key);
  const excess = coverageEntries
    .filter((entry) => entry.coverage > 1.25)
    .map((entry) => entry.key);

  const proteinConsistency =
    totals.protein / dayCount >= macroTargets.protein * 0.95
      ? "high"
      : totals.protein / dayCount >= macroTargets.protein * 0.75
        ? "moderate"
        : "low";
  const fiberTrend = totals.fiber / dayCount >= 25 ? "increasing" : "steady";
  const sugarTrend = totals.carbs / dayCount >= macroTargets.carbs ? "decreasing" : "stable";

  const plantKeywords = ["salad", "bowl", "tofu", "lentil", "bean", "vegetable", "veg", "quinoa"];
  const animalKeywords = ["chicken", "beef", "pork", "turkey", "fish", "egg", "cheese", "yogurt"];
  const seasonalKeywords = ["seasonal", "fresh", "summer", "spring", "harvest"];
  const plantMeals = meals.filter((meal) =>
    plantKeywords.some((keyword) => meal.title?.toLowerCase().includes(keyword))
  ).length;
  const animalMeals = meals.filter((meal) =>
    animalKeywords.some((keyword) => meal.title?.toLowerCase().includes(keyword))
  ).length;
  const plantToAnimalRatio = Number(
    ((plantMeals || 0) / Math.max(animalMeals || 1, 1)).toFixed(2)
  );
  const seasonalMeals = meals.filter((meal) =>
    seasonalKeywords.some((keyword) => meal.title?.toLowerCase().includes(keyword))
  ).length;
  const seasonalIngredientPercentage = meals.length
    ? Math.round((seasonalMeals / meals.length) * 100)
    : 0;

  return {
    nutritionalBalanceScore,
    diversityIndex,
    micronutrientCoverage: {
      percentage: coveragePercentage,
      deficiencies,
      excess
    },
    weeklyTrends: {
      proteinConsistency,
      fiberTrend,
      sugarTrend
    },
    sustainabilityMetrics: {
      plantToAnimalRatio: Number.isFinite(plantToAnimalRatio) ? plantToAnimalRatio : plantMeals ? plantMeals : 0,
      seasonalIngredientPercentage
    }
  };
};
