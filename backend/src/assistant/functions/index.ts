import { randomUUID } from "crypto";
import { getProfile } from "../../repositories/profile.repo.js";
import { getUserById } from "../../repositories/user.repo.js";
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
import type { MealPlanDay, MealPlanMeal, MealPlanDocument, ProcessedMetricsDocument } from "../../domain/types.js";
import { listMealPlanEntriesRaw } from "../../repositories/calories.repo.js";

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

const computeBmi = (weightKg: number | null | undefined, heightCm: number | null | undefined) => {
  if (weightKg == null || heightCm == null) {
    return null;
  }
  const meters = heightCm / 100;
  if (!Number.isFinite(meters) || meters <= 0) {
    return null;
  }
  return Number((weightKg / (meters * meters)).toFixed(1));
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

interface ProfileSnapshot {
  normalized: {
    weightKg: number | null;
    heightCm: number | null;
    bmi: number | null;
  };
  physicalMetrics: {
    weight: number | null;
    height: number | null;
    bmi: number | null;
  };
  goals: Record<string, unknown>;
  updatedAt: string;
}

const buildSnapshotFromProfile = (profile: Awaited<ReturnType<typeof getProfile>>): ProfileSnapshot => {
  const normalizedMetrics = (profile?.current.normalized ?? {}) as Record<string, unknown>;
  const physicalMetrics = (profile?.current.physicalMetrics ?? {}) as Record<string, unknown>;
  const goals = (profile?.current.goals ?? {}) as Record<string, unknown>;

  const normalizedWeight = toNumber(
    normalizedMetrics.weightKg ?? normalizedMetrics.weight_kg ?? physicalMetrics.weight
  );
  const normalizedHeight = toNumber(
    normalizedMetrics.heightCm ??
      normalizedMetrics.height_cm ??
      physicalMetrics.height ??
      physicalMetrics.height_cm
  );
  const normalizedBmi =
    toNumber(normalizedMetrics.bmi ?? physicalMetrics.bmi) ??
    computeBmi(normalizedWeight, normalizedHeight);

  return {
    normalized: {
      weightKg: normalizedWeight,
      heightCm: normalizedHeight,
      bmi: normalizedBmi
    },
    physicalMetrics: {
      weight: toNumber(physicalMetrics.weight),
      height: toNumber(physicalMetrics.height ?? physicalMetrics.height_cm),
      bmi: toNumber(physicalMetrics.bmi)
    },
    goals,
    updatedAt: profile?.current.updatedAt ? profile.current.updatedAt.toDate().toISOString() : new Date().toISOString()
  };
};

interface MetricEntry {
  metricType: MetricType;
  unit: string;
  updatedAt: string;
  currentValue: number | null;
  history: Array<{ date: string; value: number; label?: string }>;
  status: "ok" | "not_found";
  heightCm?: number | null;
}

type SimplifiedMealPlan = Pick<
  MealPlanDocument,
  "id" | "startDate" | "endDate" | "duration" | "timezone" | "strategySummary" | "analysis" | "days"
>;

const parseIsoString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${trimmed}T00:00:00.000Z`;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (value && typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
};

const extractDateOnly = (value: unknown): string | null => {
  const iso = parseIsoString(value);
  return iso ? iso.slice(0, 10) : null;
};

const defaultTimeForMealType = (type: string) => {
  if (type.includes("breakfast")) return "08:00:00.000Z";
  if (type.includes("lunch")) return "12:30:00.000Z";
  if (type.includes("snack")) return "15:30:00.000Z";
  if (type.includes("dinner")) return "19:30:00.000Z";
  return "12:00:00.000Z";
};

const buildMealPlanFromDocument = (doc: Record<string, unknown>): SimplifiedMealPlan | null => {
  const days = Array.isArray(doc.days) ? (doc.days as MealPlanDay[]) : [];
  if (!days.length) {
    return null;
  }
  const startDate =
    typeof doc.startDate === "string" && doc.startDate
      ? doc.startDate
      : days[0]?.date ?? new Date().toISOString().slice(0, 10);
  const endDate =
    typeof doc.endDate === "string" && doc.endDate
      ? doc.endDate
      : days[days.length - 1]?.date ?? startDate;
  const duration =
    doc.duration === "weekly" || doc.duration === "daily"
      ? doc.duration
      : days.length >= 7
        ? "weekly"
        : "daily";
  const timezone = typeof doc.timezone === "string" && doc.timezone ? doc.timezone : "UTC";
  return {
    id:
      typeof doc.id === "string" && doc.id
        ? doc.id
        : typeof doc.planId === "string" && doc.planId
          ? doc.planId
          : "meal-plan",
    startDate,
    endDate,
    duration,
    timezone,
    strategySummary: typeof doc.strategySummary === "string" ? doc.strategySummary : "",
    analysis: doc.analysis as MealPlanDocument["analysis"] | undefined,
    days: days.map((day) => ({
      date: day.date,
      meals: day.meals ?? []
    }))
  };
};

const buildMealPlanFromLegacyEntries = (entries: Array<Record<string, unknown>>): SimplifiedMealPlan | null => {
  if (!entries.length) {
    return null;
  }

  for (const rawDoc of entries) {
    const docPlan = buildMealPlanFromDocument(rawDoc);
    if (docPlan) {
      return docPlan;
    }
  }

  const grouped = new Map<string, MealPlanMeal[]>();
  let timezone: string | null = null;

  entries.forEach((rawEntry) => {
    const entry = asRecord(rawEntry);
    const date =
      extractDateOnly(entry.date) ??
      extractDateOnly(entry.scheduledAt) ??
      extractDateOnly(entry.scheduled_at) ??
      extractDateOnly(entry.mealDate) ??
      extractDateOnly(entry.loggedAt);
    if (!date) {
      return;
    }

    const typeValue = String(
      entry.type ??
        entry.mealType ??
        entry.meal_type ??
        entry.category ??
        entry.mealCategory ??
        "meal"
    ).toLowerCase();

    const scheduledAt =
      parseIsoString(entry.scheduledAt ?? entry.scheduled_at ?? entry.mealTime ?? entry.loggedAt) ??
      `${date}T${defaultTimeForMealType(typeValue)}`;

    const macrosRecord = asRecord(entry.macros);
    const macros = {
      calories: toNumber(macrosRecord.calories ?? entry.calories ?? entry.kcal) ?? 0,
      protein: toNumber(macrosRecord.protein ?? entry.protein) ?? 0,
      carbs: toNumber(macrosRecord.carbs ?? entry.carbs) ?? 0,
      fats: toNumber(macrosRecord.fats ?? entry.fats) ?? 0
    };

    const micronutrientsRecord = asRecord(entry.micronutrients);
    const micronutrients = Object.entries(micronutrientsRecord).reduce<Record<string, number>>((acc, [key, value]) => {
      const parsed = toNumber(value);
      if (parsed != null) {
        acc[key] = parsed;
      }
      return acc;
    }, {});

    const titleSource =
      entry.title ??
      entry.mealName ??
      entry.name ??
      entry.recipeTitle ??
      entry.label ??
      entry.displayName;

    const meal: MealPlanMeal = {
      id:
        typeof entry.id === "string" && entry.id
          ? entry.id
          : typeof entry.mealId === "string" && entry.mealId
            ? entry.mealId
            : randomUUID(),
      type: typeValue || "meal",
      title: typeof titleSource === "string" && titleSource.trim().length ? titleSource : "Logged meal",
      recipeId: typeof entry.recipeId === "string" ? entry.recipeId : undefined,
      servings: toNumber(entry.servings) ?? 1,
      scheduledAt,
      macros,
      ...(Object.keys(micronutrients).length ? { micronutrients } : {}),
      ...(typeof entry.notes === "string" && entry.notes.trim().length ? { notes: entry.notes } : {})
    };

    const bucket = grouped.get(date) ?? [];
    bucket.push(meal);
    grouped.set(date, bucket);
    if (!timezone && typeof entry.timezone === "string") {
      timezone = entry.timezone;
    }
  });

  if (!grouped.size) {
    return null;
  }

  const sortedDates = [...grouped.keys()].sort();
  const days = sortedDates.map((date) => ({
    date,
    meals: grouped
      .get(date)!
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  }));

  return {
    id: "logged-meals",
    startDate: sortedDates[0],
    endDate: sortedDates[sortedDates.length - 1],
    duration: days.length >= 7 ? "weekly" : "daily",
    timezone: timezone ?? "UTC",
    strategySummary: "Logged meals",
    analysis: undefined,
    days
  };
};

const loadAssistantMealPlan = async (userId: string): Promise<SimplifiedMealPlan | null> => {
  const plans = await listUserMealPlans(userId, 1);
  const latest = plans[0];
  if (latest) {
    return {
      id: latest.id,
      startDate: latest.startDate,
      endDate: latest.endDate,
      duration: latest.duration,
      timezone: latest.timezone,
      strategySummary: latest.strategySummary,
      analysis: latest.analysis,
      days: latest.days
    };
  }
  const fallbackEntries = await listMealPlanEntriesRaw(userId, 60);
  return buildMealPlanFromLegacyEntries(fallbackEntries as Array<Record<string, unknown>>);
};

const buildSnapshotFromProcessedMetrics = (entry: ProcessedMetricsDocument | null): ProfileSnapshot | null => {
  if (!entry) return null;
  const metrics = asRecord(entry.userMetrics);
  const current = asRecord(metrics.current_state);
  const normalized = asRecord(current.normalized);
  const target = asRecord(metrics.target_state);
  const goals = asRecord(metrics.goals);
  const metadata = asRecord(metrics.metadata);

  const weight =
    toNumber(current.weight_kg ?? current.weightKg) ??
    toNumber(normalized.weightKg ?? normalized.weight_kg);
  const height =
    toNumber(current.height_cm ?? current.heightCm ?? current.height) ??
    toNumber(normalized.heightCm ?? normalized.height_cm);
  const bmi =
    toNumber(current.bmi ?? normalized.bmi) ??
    computeBmi(weight, height);

  const resolvedGoals: Record<string, unknown> = {
    ...goals
  };
  const targetWeight = toNumber(target.weight_kg ?? target.weightKg);
  if (targetWeight != null && !Number.isNaN(targetWeight)) {
    resolvedGoals.targetWeightKg = targetWeight;
  }
  if (target.activity_level ?? target.activityLevel) {
    resolvedGoals.targetActivityLevel = target.activity_level ?? target.activityLevel;
  }

  if (weight == null && height == null && bmi == null) {
    return null;
  }

  const updatedAt =
    (typeof metadata.generated_at === "string" ? metadata.generated_at : null) ??
    entry.createdAt.toDate().toISOString();

  return {
    normalized: {
      weightKg: weight,
      heightCm: height,
      bmi
    },
    physicalMetrics: {
      weight,
      height,
      bmi
    },
    goals: resolvedGoals,
    updatedAt
  };
};

const buildSnapshotFromUserDoc = (user: Awaited<ReturnType<typeof getUserById>>): ProfileSnapshot | null => {
  if (!user) return null;
  const required = asRecord(user.requiredProfile);
  const additional = asRecord(user.additionalProfile);

  const weight =
    toNumber(required.weight ?? required.weight_kg) ??
    toNumber(additional.weight ?? additional.weight_kg);
  const height =
    toNumber(required.height ?? required.heightCm ?? required.height_cm) ??
    toNumber(additional.height ?? additional.heightCm ?? additional.height_cm);

  if (weight == null && height == null) {
    return null;
  }

  const bmi =
    toNumber(required.bmi ?? additional.bmi) ??
    computeBmi(weight, height);

  const resolveGoals = (...candidates: unknown[]): Record<string, unknown> => {
    for (const candidate of candidates) {
      if (candidate && typeof candidate === "object") {
        return candidate as Record<string, unknown>;
      }
    }
    return {};
  };
  const goals = resolveGoals(additional.goals, required.goals);

  return {
    normalized: {
      weightKg: weight,
      heightCm: height,
      bmi
    },
    physicalMetrics: {
      weight,
      height,
      bmi
    },
    goals,
    updatedAt: (user.updatedAt ?? user.createdAt).toDate().toISOString()
  };
};

const loadProfileSnapshot = async (userId: string): Promise<ProfileSnapshot | null> => {
  const [latestProcessed] = await listProcessedMetrics(userId, 1);
  const processedSnapshot = buildSnapshotFromProcessedMetrics(latestProcessed ?? null);
  if (processedSnapshot) {
    return processedSnapshot;
  }

  const profile = await getProfile(userId);
  if (profile) {
    return buildSnapshotFromProfile(profile);
  }
  const userDoc = await getUserById(userId);
  return buildSnapshotFromUserDoc(userDoc);
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

type MetricType = "weight" | "bmi" | "height" | "wellness_score" | "overview";

const isMetricType = (value: string): value is MetricType =>
  value === "weight" ||
  value === "bmi" ||
  value === "height" ||
  value === "wellness_score" ||
  value === "overview";

const assistantFunctionDefinitions: AssistantFunctionDefinition[] = [
  {
    name: "get_health_metrics",
    description: "Retrieves up-to-date user health metrics (weight, BMI, wellness score).",
    parameters: {
      type: "object",
      properties: {
        metric_type: {
          type: "string",
          enum: ["weight", "bmi", "height", "wellness_score", "overview"],
          description: "Metric to retrieve."
        },
        metrics: {
          type: "array",
          description: "Optional list of metrics to retrieve together.",
          items: {
            type: "string",
            enum: ["weight", "bmi", "height", "wellness_score"]
          }
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
  const rawMetric = typeof params.metric_type === "string" ? params.metric_type : "weight";
  const metric: MetricType = isMetricType(rawMetric) ? rawMetric : "weight";
  const requestedMetrics = Array.isArray(params.metrics)
    ? (params.metrics as string[]).filter((entry): entry is MetricType => isMetricType(entry))
    : [];
  if (!requestedMetrics.length) {
    requestedMetrics.push(metric);
  }
  const uniqueMetrics = [...new Set(requestedMetrics)];
  const isMultiRequest = uniqueMetrics.length > 1;
  const period =
    typeof params.time_period === "string"
      ? params.time_period
      : uniqueMetrics.includes("wellness_score")
        ? "30d"
        : "current";

  const snapshot = await loadProfileSnapshot(context.userId);
  if (!snapshot) {
    return {
      status: "not_found",
      reason: "No profile available."
    };
  }

  const { physicalMetrics, normalized, updatedAt } = snapshot;
  const goalsData = snapshot.goals;

  if (uniqueMetrics.length === 1 && uniqueMetrics[0] === "overview") {
    const weightValue = normalized.weightKg ?? physicalMetrics.weight;
    const heightValue = normalized.heightCm ?? physicalMetrics.height;
    const bmiValue = normalized.bmi ?? computeBmi(weightValue, heightValue);
    return {
      status: "ok",
      metricType: "overview",
      updatedAt,
      metrics: {
        weightKg: weightValue ?? null,
        bmi: bmiValue ?? null,
        heightCm: heightValue ?? null,
        goals: goalsData
      }
    };
  }

  const weightValue = normalized.weightKg ?? physicalMetrics.weight;
  const heightValue = normalized.heightCm ?? physicalMetrics.height;
  const bmiValue = normalized.bmi ?? computeBmi(weightValue, heightValue);

  const needsHistory =
    period !== "current" && uniqueMetrics.some((entry) => entry === "weight" || entry === "bmi");
  const snapshots = needsHistory
    ? await listProcessedMetrics(context.userId, resolveHistoryLimit(period))
    : [];

  const buildHistory = (target: "weight" | "bmi") => {
    if (!snapshots.length) {
      return [];
    }
    return snapshots
      .map((entry) => ({
        date: entry.createdAt.toDate().toISOString().slice(0, 10),
        value: extractSnapshotMetric(entry, target)
      }))
      .filter((point) => point.value != null)
      .reverse() as Array<{ date: string; value: number }>;
  };

  const buildWellnessMetric = async (): Promise<MetricEntry> => {
    const [weeklySummary, monthlySummary] = await Promise.all([
      generateWeeklySummary(context.userId).catch(() => null),
      period === "90d" || period === "30d" ? generateMonthlySummary(context.userId).catch(() => null) : null
    ]);
    const currentValue =
      weeklySummary?.metrics.averageWellnessScore ??
      monthlySummary?.metrics.averageWellnessScore ??
      null;
    const history: Array<{ date: string; value: number; label?: string }> = [];
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
      metricType: "wellness_score",
      unit: "score",
      updatedAt,
      currentValue,
      history,
      status: currentValue != null ? "ok" : "not_found"
    };
  };

  const metricBuilders: Record<MetricType, () => Promise<MetricEntry>> = {
    weight: async () => {
      const currentValue = weightValue ?? null;
      return {
        metricType: "weight",
        unit: "kg",
        updatedAt,
        currentValue,
        history: period !== "current" ? buildHistory("weight") : [],
        status: currentValue != null ? "ok" : "not_found"
      };
    },
    bmi: async () => {
      const currentValue = bmiValue ?? null;
      return {
        metricType: "bmi",
        unit: "",
        updatedAt,
        currentValue,
        history: period !== "current" ? buildHistory("bmi") : [],
        status: currentValue != null ? "ok" : "not_found"
      };
    },
    height: async () => {
      const currentHeight = heightValue ?? null;
      return {
        metricType: "height",
        unit: "cm",
        updatedAt,
        currentValue: currentHeight,
        history: [],
        status: currentHeight != null ? "ok" : "not_found",
        heightCm: currentHeight
      };
    },
    wellness_score: buildWellnessMetric,
    overview: async () => ({
      metricType: "overview",
      unit: "",
      updatedAt,
      currentValue: null,
      history: [],
      status: "ok"
    })
  };

  const metricEntries = await Promise.all(uniqueMetrics.map((entry) => metricBuilders[entry]()));

  if (!isMultiRequest) {
    const entry = metricEntries[0];
    if (entry.metricType === "height") {
      return {
        status: entry.status,
        metricType: entry.metricType,
        unit: entry.unit,
        updatedAt: entry.updatedAt,
        currentValue: entry.currentValue,
        history: entry.history,
        heightCm: entry.heightCm ?? null
      };
    }
    return {
      status: entry.status,
      metricType: entry.metricType,
      unit: entry.unit,
      updatedAt: entry.updatedAt,
      currentValue: entry.currentValue,
      history: entry.history
    };
  }

  const aggregatedStatus = metricEntries.some((entry) => entry.status === "ok") ? "ok" : "not_found";
  return {
    status: aggregatedStatus,
    metricType: "multiple",
    updatedAt,
    metrics: metricEntries.map(({ status, ...rest }) => rest)
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
  const plan = await loadAssistantMealPlan(context.userId);
  if (!plan) {
    return {
      status: "not_found",
      reason: "No active meal plan found."
    };
  }

  const requestedDay =
    typeof params.day === "string" && params.day.trim().length
      ? params.day.trim()
      : new Date().toISOString().slice(0, 10);
  const includeRecipes = params.include_recipes === true;
  const day = plan.days.find((entry) => entry.date === requestedDay) ?? plan.days[0];

  return {
    status: "ok",
    planId: plan.id,
    range: {
      start: plan.startDate,
      end: plan.endDate
    },
    timezone: plan.timezone ?? "UTC",
    date: day?.date ?? requestedDay,
    meals: day ? day.meals.map((meal) => formatMeal(meal, includeRecipes)) : [],
    metadata: {
      duration: plan.duration,
      strategySummary: plan.strategySummary,
      analysis: plan.analysis
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
