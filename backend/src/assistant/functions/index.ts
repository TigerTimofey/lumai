import { getProfile } from "../../repositories/profile.repo.js";
import { listProcessedMetrics } from "../../repositories/processed-metrics.repo.js";
import { generateGoalProgress } from "../../services/goal-progress.service.js";
import { listUserMealPlans } from "../../services/meal-planning.service.js";
import { getRecipe } from "../../services/nutrition-rag.service.js";
import { getSnapshots } from "../../services/nutrition-snapshot.service.js";
import { fetchNutritionPreferences } from "../../services/nutrition-preferences.service.js";
import { generateWeeklySummary, generateMonthlySummary } from "../../services/health-summary.service.js";
import {
  buildVisualizationPayload,
  type VisualizationType
} from "../visualizations/chart-builder.js";
import type { AssistantFunctionContext } from "../types.js";
import type { AssistantFunctionDefinition } from "../conversation/model.js";
import type { MealPlanDay, MealPlanMeal } from "../../domain/types.js";

type AssistantFunctionHandler = (
  params: Record<string, unknown>,
  context: AssistantFunctionContext
) => Promise<unknown>;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveHistoryLimit = (period?: string) => {
  switch (period) {
    case "7d":
      return 10;
    case "90d":
      return 45;
    case "30d":
      return 30;
    default:
      return 14;
  }
};

const extractSnapshotMetric = (
  doc: Awaited<ReturnType<typeof listProcessedMetrics>>[number],
  metric: "weight" | "bmi"
) => {
  const metrics = (doc.userMetrics ?? {}) as Record<string, unknown>;
  const current = (metrics.current_state ?? {}) as Record<string, unknown>;
  const normalized = (metrics.normalized ?? current.normalized ?? {}) as Record<string, unknown>;
  if (metric === "weight") {
    return (
      toNumber(current.weight_kg) ??
      toNumber(current.weightKg) ??
      toNumber(normalized.weightKg) ??
      toNumber(normalized.weight_kg)
    );
  }
  return toNumber(current.bmi) ?? toNumber(normalized.bmi);
};

const assistantFunctionDefinitions: AssistantFunctionDefinition[] = [
  {
    name: "get_health_metrics",
    description: "Retrieves up-to-date user health metrics (weight, BMI, wellness score).",
    parameters: {
      type: "object",
      properties: {
        metric_type: {
          type: "string",
          enum: ["weight", "bmi", "wellness_score", "overview"],
          description: "Metric to retrieve."
        },
        time_period: {
          type: "string",
          enum: ["current", "7d", "30d", "90d"],
          description: "Duration for trend data."
        }
      },
      required: ["metric_type"]
    }
  },
  {
    name: "get_goal_progress",
    description: "Returns progress toward goals with milestone breakdowns.",
    parameters: {
      type: "object",
      properties: {
        goal_type: {
          type: "string",
          description: "Optional goal focus to highlight (weight, activity, habits)."
        }
      }
    }
  },
  {
    name: "get_meal_plan",
    description: "Fetches the current meal plan with meal details for a specific day.",
    parameters: {
      type: "object",
      properties: {
        day: {
          type: "string",
          description: "ISO date (YYYY-MM-DD). Defaults to today."
        },
        include_recipes: {
          type: "boolean",
          description: "Whether to include recipe IDs for each meal."
        }
      }
    }
  },
  {
    name: "get_nutrition_snapshot",
    description: "Provides nutrition totals vs. targets for a recent date range.",
    parameters: {
      type: "object",
      properties: {
        time_period: {
          type: "string",
          enum: ["today", "7d", "30d"],
          description: "Range for logged intake."
        }
      }
    }
  },
  {
    name: "get_recipe_details",
    description: "Returns recipe instructions, ingredients, and nutrition.",
    parameters: {
      type: "object",
      properties: {
        recipe_id: {
          type: "string",
          description: "Recipe identifier from the user's meal plan."
        }
      },
      required: ["recipe_id"]
    }
  },
  {
    name: "get_visualization",
    description: "Generates chart-ready data for trends or comparisons.",
    parameters: {
      type: "object",
      properties: {
        visualization_type: {
          type: "string",
          enum: ["weight_trend", "protein_vs_target", "macro_breakdown"]
        },
        time_period: {
          type: "string",
          description: "Optional timeframe for the visualization."
        }
      },
      required: ["visualization_type"]
    }
  }
];

const getHealthMetrics: AssistantFunctionHandler = async (params, context) => {
  const metric = typeof params.metric_type === "string" ? params.metric_type : "weight";
  const period =
    typeof params.time_period === "string" ? params.time_period : metric === "wellness_score" ? "30d" : "current";

  const profile = await getProfile(context.userId);
  if (!profile) {
    return {
      status: "not_found",
      reason: "No profile available."
    };
  }

  const { physicalMetrics, normalized } = profile.current;
  const updatedAt = profile.current.updatedAt.toDate().toISOString();

  if (metric === "overview") {
    return {
      status: "ok",
      metricType: "overview",
      updatedAt,
      metrics: {
        weightKg: normalized?.weightKg ?? physicalMetrics.weight,
        bmi: normalized?.bmi ?? null,
        heightCm: normalized?.heightCm ?? physicalMetrics.height,
        goals: profile.current.goals
      }
    };
  }

  if (metric === "wellness_score") {
    const [weeklySummary, monthlySummary] = await Promise.all([
      generateWeeklySummary(context.userId).catch(() => null),
      period === "90d" || period === "30d" ? generateMonthlySummary(context.userId).catch(() => null) : null
    ]);
    const currentValue =
      weeklySummary?.metrics.averageWellnessScore ??
      monthlySummary?.metrics.averageWellnessScore ??
      null;
    const history = [];
    if (weeklySummary?.metrics.averageWellnessScore != null) {
      history.push({
        date: weeklySummary.endDate.toISOString().slice(0, 10),
        value: weeklySummary.metrics.averageWellnessScore,
        label: "Weekly average"
      });
    }
    if (monthlySummary?.metrics.averageWellnessScore != null) {
      history.push({
        date: monthlySummary.endDate.toISOString().slice(0, 10),
        value: monthlySummary.metrics.averageWellnessScore,
        label: "Monthly average"
      });
    }
    return {
      status: currentValue != null ? "ok" : "not_found",
      metricType: "wellness_score",
      unit: "score",
      updatedAt,
      currentValue,
      history
    };
  }

  const currentValue =
    metric === "weight"
      ? normalized?.weightKg ?? physicalMetrics.weight
      : normalized?.bmi ?? null;

  let history: Array<{ date: string; value: number }> = [];
  if (period !== "current") {
    const snapshots = await listProcessedMetrics(context.userId, resolveHistoryLimit(period));
    history = snapshots
      .map((entry) => ({
        date: entry.createdAt.toDate().toISOString().slice(0, 10),
        value: extractSnapshotMetric(entry, metric === "weight" ? "weight" : "bmi")
      }))
      .filter((point) => point.value != null)
      .reverse() as Array<{ date: string; value: number }>;
  }

  return {
    status: currentValue != null ? "ok" : "not_found",
    metricType: metric,
    unit: metric === "weight" ? "kg" : "",
    updatedAt,
    currentValue,
    history
  };
};

const getGoalProgress: AssistantFunctionHandler = async (_params, context) => {
  const progress = await generateGoalProgress(context.userId);
  if (!progress) {
    return {
      status: "not_found",
      reason: "Goal progress is unavailable."
    };
  }
  return {
    status: "ok",
    progress
  };
};

const formatMeal = (meal: MealPlanMeal, includeRecipes: boolean) => ({
  mealId: meal.id,
  type: meal.type,
  title: meal.title,
  scheduledAt: meal.scheduledAt,
  macros: meal.macros,
  recipeId: includeRecipes ? meal.recipeId ?? null : undefined,
  notes: meal.notes ?? null
});

const getMealPlan: AssistantFunctionHandler = async (params, context) => {
  const days = await listUserMealPlans(context.userId, 1);
  const latest = days[0];
  if (!latest) {
    return {
      status: "not_found",
      reason: "No active meal plan found."
    };
  }
  const requestedDay = typeof params.day === "string" && params.day.trim().length
    ? params.day.trim()
    : new Date().toISOString().slice(0, 10);
  const includeRecipes = params.include_recipes === true;
  const day = (latest.days as MealPlanDay[]).find((entry) => entry.date === requestedDay) ?? latest.days[0];
  return {
    status: "ok",
    planId: latest.id,
    range: {
      start: latest.startDate,
      end: latest.endDate
    },
    timezone: latest.timezone,
    date: day?.date ?? requestedDay,
    meals: day ? day.meals.map((meal) => formatMeal(meal, includeRecipes)) : [],
    metadata: {
      duration: latest.duration,
      strategySummary: latest.strategySummary,
      analysis: latest.analysis
    }
  };
};

const getNutritionSnapshot: AssistantFunctionHandler = async (params, context) => {
  const period = typeof params.time_period === "string" ? params.time_period : "today";
  const limit = period === "30d" ? 30 : period === "7d" ? 7 : 1;
  const [snapshots, preferences] = await Promise.all([
    getSnapshots(context.userId, limit),
    fetchNutritionPreferences(context.userId)
  ]);
  if (!snapshots.length) {
    return {
      status: "not_found",
      reason: "No nutrition logs recorded."
    };
  }
  const entries = snapshots
    .map((snapshot) => ({
      date: snapshot.date,
      totals: snapshot.totals,
      goalComparison: snapshot.goalComparison,
      wellnessImpactScore: snapshot.wellnessImpactScore ?? null
    }))
    .reverse();
  return {
    status: "ok",
    timePeriod: period,
    targets: {
      calories: preferences.calorieTarget,
      macronutrients: preferences.macronutrientTargets
    },
    entries
  };
};

const getRecipeDetails: AssistantFunctionHandler = async (params, context) => {
  const recipeId =
    typeof params.recipe_id === "string" ? params.recipe_id.trim() : "";
  if (!recipeId) {
    return {
      status: "error",
      reason: "recipe_id is required"
    };
  }
  const recipe = await getRecipe(recipeId);
  if (!recipe) {
    return {
      status: "not_found",
      reason: "Recipe not found."
    };
  }
  return {
    status: "ok",
    recipe: {
      id: recipe.id,
      title: recipe.title,
      cuisine: recipe.cuisine,
      servings: recipe.servings,
      prepTimeMin: recipe.prepTimeMin,
      cookTimeMin: recipe.cookTimeMin,
      summary: recipe.summary,
      dietaryTags: recipe.dietaryTags,
      allergenTags: recipe.allergenTags,
      macrosPerServing: recipe.macrosPerServing,
      micronutrientsPerServing: recipe.micronutrientsPerServing,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      preparation: recipe.preparation ?? []
    }
  };
};

const getVisualization: AssistantFunctionHandler = async (params, context) => {
  const type =
    typeof params.visualization_type === "string"
      ? (params.visualization_type as VisualizationType)
      : "weight_trend";
  const payload = await buildVisualizationPayload(context.userId, {
    type,
    timePeriod: typeof params.time_period === "string" ? params.time_period : undefined
  });
  if (!payload) {
    return {
      status: "not_found",
      reason: "Unable to build visualization from current data."
    };
  }
  return {
    status: "ok",
    visualization: payload
  };
};

const functionHandlers: Record<string, AssistantFunctionHandler> = {
  get_health_metrics: getHealthMetrics,
  get_goal_progress: getGoalProgress,
  get_meal_plan: getMealPlan,
  get_nutrition_snapshot: getNutritionSnapshot,
  get_recipe_details: getRecipeDetails,
  get_visualization: getVisualization
};

export const getAssistantFunctionDefinitions = () => assistantFunctionDefinitions;

export const executeAssistantFunction = async (
  name: string,
  params: Record<string, unknown>,
  context?: AssistantFunctionContext
) => {
  const handler = functionHandlers[name];
  if (!handler || !context) {
    throw new Error(`Unsupported function: ${name}`);
  }
  return handler(params ?? {}, context);
};
