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
  listMealPlans,
  updateMealPlan
} from "../repositories/calories.repo.js";
import { fetchNutritionPreferences } from "./nutrition-preferences.service.js";
import { searchRecipes } from "./nutrition-rag.service.js";
import { calculateNutritionForRecipe } from "./nutrition-functions.service.js";
import { orchestrateMealPlan } from "./meal-planning-orchestrator.service.js";
import { FALLBACK_RECIPES } from "../data/fallback-recipes.js";
import { badRequest, notFound, serviceUnavailable } from "../utils/api-error.js";
import { getProfile } from "../repositories/profile.repo.js";
import { buildHealthAwareRecipeFilters } from "../utils/recipe-filters.js";

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
  await updateMealPlan(userId, planId, {
    ...regenerated,
    version: existing.version + 1,
    updatedAt: Timestamp.now()
  });
  return getMealPlan(userId, planId);
};

export const regenerateMeal = async (userId: string, planId: string, date: string, mealId: string) => {
  const plan = await getMealPlan(userId, planId);
  if (!plan) throw notFound("Meal plan not found");
  const preferences = await fetchNutritionPreferences(userId);
  const ragResults = await searchRecipes({
    query: "healthy meal substitution",
    dietaryTags: preferences.dietaryPreferences,
    excludeAllergens: preferences.allergies,
    cuisine: preferences.cuisinePreferences,
    limit: 5
  });
  const day = plan.days.find((entry) => entry.date === date);
  if (!day) throw badRequest("Day not found in plan");
  const mealIndex = day.meals.findIndex((meal) => meal.id === mealId);
  if (mealIndex === -1) throw badRequest("Meal not found");
  const replacementRecipe = ragResults[0]?.recipe ?? FALLBACK_RECIPES[0];
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

export const generateMealAlternatives = async (userId: string, query: string) => {
  const [preferences, profile] = await Promise.all([
    fetchNutritionPreferences(userId),
    getProfile(userId)
  ]);
  const results = await searchRecipes(
    buildHealthAwareRecipeFilters(preferences, profile, {
      query,
      limit: 5
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
