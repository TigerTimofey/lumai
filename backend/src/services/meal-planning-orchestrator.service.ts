import crypto from "crypto";
import env from "../config/env.js";
import { runPromptStep } from "./ai.service.js";
import { fetchNutritionPreferences } from "./nutrition-preferences.service.js";
import { getUserById } from "../repositories/user.repo.js";
import { getProfile } from "../repositories/profile.repo.js";
import { searchRecipes } from "./nutrition-rag.service.js";
import { calculateNutritionByRecipeId } from "./nutrition-functions.service.js";
import type { MealPlanDay, MealPlanMeal, RecipeDocument } from "../domain/types.js";
import { logAiInsight } from "../repositories/ai-insight.repo.js";
import { buildHealthAwareRecipeFilters } from "../utils/recipe-filters.js";

const parseJson = <T>(payload: string): T => {
  try {
    const firstBrace = payload.indexOf("{");
    if (firstBrace > 0) {
      const lastBrace = payload.lastIndexOf("}");
      if (lastBrace > firstBrace) {
        return JSON.parse(payload.slice(firstBrace, lastBrace + 1)) as T;
      }
    }
    return JSON.parse(payload) as T;
  } catch (error) {
    throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export interface AiMealPlanResult {
  days: MealPlanDay[];
  strategySummary: string;
  ragReferences: string[];
  analysis?: {
    highlights: string[];
    risks: string[];
    suggestions: string[];
  };
}

export const orchestrateMealPlan = async (userId: string, duration: "daily" | "weekly", startDate: string) => {
  const [preferences, user, profile] = await Promise.all([
    fetchNutritionPreferences(userId),
    getUserById(userId),
    getProfile(userId)
  ]);
  const ragResults = await searchRecipes(
    buildHealthAwareRecipeFilters(preferences, profile, {
      query: "nutritious meals",
      limit: 12
    })
  );
  const ragContext = ragResults.map((entry) => ({
    id: entry.recipe.id,
    title: entry.recipe.title,
    macros: entry.recipe.macrosPerServing,
    dietaryTags: entry.recipe.dietaryTags
  }));

  const userProfile = {
    requiredProfile: user?.requiredProfile ?? {},
    additionalProfile: user?.additionalProfile ?? {},
    goals: user?.profileVersionId ?? null
  };

  const strategyRaw = await runPromptStep({
    step: "strategy",
    userProfile,
    dietaryPreferences: preferences.dietaryPreferences,
    allergies: preferences.allergies,
    targets: {
      calorieTarget: preferences.calorieTarget,
      macronutrientTargets: preferences.macronutrientTargets
    },
    retryCount: 2
  });

  const strategyJson = parseJson<{ strategy_summary: string; macro_focus: string }>(strategyRaw.content ?? strategyRaw);
  await logAiInsight(userId, {
    promptContext: {
      reason: "nutrition_plan_strategy",
      targets: preferences.macronutrientTargets
    },
    model: env.HF_MODEL ?? "meta-llama/Meta-Llama-3-8B-Instruct",
    status: "success",
    response: strategyJson
  });

  const structureRaw = await runPromptStep({
    step: "structure",
    userProfile,
    dietaryPreferences: preferences.dietaryPreferences,
    allergies: preferences.allergies,
    targets: { calorieTarget: preferences.calorieTarget },
    strategy: JSON.stringify(strategyJson),
    duration,
    timezone: preferences.timezone,
    startDate
  });
  const structureJson = parseJson<{ meal_structure: Array<{ dayOffset: number; type: string; time: string }>; notes: string }>(structureRaw.content ?? structureRaw);
  await logAiInsight(userId, {
    promptContext: { reason: "nutrition_plan_structure" },
    model: env.HF_MODEL ?? "meta-llama/Meta-Llama-3-8B-Instruct",
    status: "success",
    response: structureJson
  });

  const recipesRaw = await runPromptStep({
    step: "recipes",
    userProfile,
    dietaryPreferences: preferences.dietaryPreferences,
    allergies: preferences.allergies,
    targets: { calorieTarget: preferences.calorieTarget },
    structure: JSON.stringify(structureJson),
    recipes: JSON.stringify(ragContext.slice(0, 6)),
    restrictions: preferences.dietaryRestrictions.join(", ")
  });
  const recipesJson = parseJson<{ meals: Array<{ dayOffset: number; type: string; recipeId?: string; description?: string; scheduledAt?: string }> }>(recipesRaw.content ?? recipesRaw);
  await logAiInsight(userId, {
    promptContext: { reason: "nutrition_plan_recipes", ragSample: ragContext.slice(0, 3) },
    model: env.HF_MODEL ?? "meta-llama/Meta-Llama-3-8B-Instruct",
    status: "success",
    response: recipesJson
  });

  const planSummary = buildPlanSummary(recipesJson.meals);
  const analyticsRaw = await runPromptStep({
    step: "analytics",
    userProfile,
    dietaryPreferences: preferences.dietaryPreferences,
    allergies: preferences.allergies,
    targets: { calorieTarget: preferences.calorieTarget },
    planSummary
  });
  const analyticsJson = parseJson<{ highlights?: string[]; risks?: string[]; suggestions?: string[] }>(analyticsRaw.content ?? analyticsRaw);
  await logAiInsight(userId, {
    promptContext: { reason: "nutrition_plan_analytics" },
    model: env.HF_MODEL ?? "meta-llama/Meta-Llama-3-8B-Instruct",
    status: "success",
    response: analyticsJson
  });

  const recipeLookup = new Map(ragResults.map((entry) => [entry.recipe.id, entry.recipe]));
  const days = await buildDaysFromAiMeals(recipesJson.meals, startDate, preferences.timezone, recipeLookup);
  return {
    days,
    strategySummary: strategyJson.strategy_summary ?? "",
    ragReferences: ragContext.slice(0, 6).map((entry) => entry.id),
    analysis: {
      highlights: analyticsJson.highlights ?? [],
      risks: analyticsJson.risks ?? [],
      suggestions: analyticsJson.suggestions ?? []
    }
  } as AiMealPlanResult;
};

const buildPlanSummary = (meals: Array<{ type: string; recipeId?: string; description?: string }>) => {
  const summary = meals.map((meal) => `${meal.type}: ${meal.recipeId ?? meal.description ?? "custom"}`).join(" | ");
  return summary.slice(0, 1000);
};

const buildDaysFromAiMeals = async (
  meals: Array<{ dayOffset: number; type: string; recipeId?: string; description?: string; scheduledAt?: string }>,
  startDate: string,
  timezone: string,
  recipeLookup: Map<string, RecipeDocument>
) => {
  const grouped = new Map<string, MealPlanDay>();
  for (const meal of meals) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + (meal.dayOffset ?? 0));
    const isoDate = date.toISOString().slice(0, 10);
    if (!grouped.has(isoDate)) {
      grouped.set(isoDate, { date: isoDate, meals: [] });
    }
    const day = grouped.get(isoDate)!;
    const recipeDetails = meal.recipeId ? recipeLookup.get(meal.recipeId) : undefined;
    const mealEntry: MealPlanMeal = {
      id: crypto.randomUUID(),
      type: meal.type ?? "meal",
      title: recipeDetails?.title ?? (meal.recipeId ? "AI recipe" : meal.description ?? "Custom meal"),
      recipeId: meal.recipeId,
      servings: 1,
      scheduledAt: meal.scheduledAt ?? date.toISOString(),
      macros: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0
      }
    };
    if (recipeDetails) {
      mealEntry.metadata = {
        prepTimeMin: recipeDetails.prepTimeMin,
        cookTimeMin: recipeDetails.cookTimeMin
      };
    }
    if (meal.recipeId) {
      try {
        const nutrition = await calculateNutritionByRecipeId(meal.recipeId, 1);
        mealEntry.macros = {
          calories: nutrition.calories,
          protein: nutrition.protein,
          carbs: nutrition.carbs,
          fats: nutrition.fats
        };
        mealEntry.micronutrients = nutrition.micronutrients;
      } catch {}
    }
    day.meals.push(mealEntry);
  }

  return Array.from(grouped.values());
};
