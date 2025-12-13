import { listProcessedMetrics } from "../../repositories/processed-metrics.repo.js";
import { listSnapshots } from "../../repositories/calories.repo.js";
import { fetchNutritionPreferences } from "../../services/nutrition-preferences.service.js";
import type { ProcessedMetricsDocument } from "../../domain/types.js";

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

const extractWeightFromSnapshot = (doc: ProcessedMetricsDocument): number | null => {
  const metrics = (doc.userMetrics ?? {}) as Record<string, unknown>;
  const current = (metrics.current_state ?? {}) as Record<string, unknown>;
  const normalized = (metrics.normalized ?? current.normalized ?? {}) as Record<string, unknown>;
  return (
    toNumber(current.weight_kg) ??
    toNumber(current.weightKg) ??
    toNumber(normalized.weightKg) ??
    toNumber(normalized.weight_kg) ??
    null
  );
};

export type VisualizationType = "weight_trend" | "protein_vs_target" | "macro_breakdown" | "sleep_vs_target";

export interface VisualizationRequest {
  type: VisualizationType;
  timePeriod?: string;
}

export interface VisualizationPayload {
  type: VisualizationType;
  title: string;
  timePeriod: string;
  description: string;
  data: Record<string, unknown>;
}

const buildWeightTrend = async (
  userId: string,
  timePeriod: string
): Promise<VisualizationPayload | null> => {
  const limit = timePeriod === "90d" ? 40 : timePeriod === "30d" ? 30 : 14;
  const snapshots = await listProcessedMetrics(userId, limit);
  const points = snapshots
    .map((entry) => ({
      date: entry.createdAt.toDate().toISOString().slice(0, 10),
      value: extractWeightFromSnapshot(entry)
    }))
    .filter((point) => point.value != null)
    .reverse();
  if (!points.length) {
    return null;
  }
  return {
    type: "weight_trend",
    title: "Weight trend",
    timePeriod,
    description: "Chronological plot of recorded weight updates.",
    data: {
      series: points
    }
  };
};

const buildProteinComparison = async (
  userId: string,
  timePeriod: string
): Promise<VisualizationPayload | null> => {
  const limit = timePeriod === "30d" ? 30 : 7;
  const [snapshots, preferences] = await Promise.all([
    listSnapshots(userId, limit),
    fetchNutritionPreferences(userId)
  ]);
  if (!snapshots.length) {
    return null;
  }
  const series = snapshots
    .map((snapshot) => ({
      date: snapshot.date,
      actual: snapshot.totals.protein,
      target: preferences.macronutrientTargets.protein
    }))
    .reverse();
  return {
    type: "protein_vs_target",
    title: "Protein vs. target",
    timePeriod,
    description: "Bar chart comparing logged protein intake against the configured target.",
    data: {
      series,
      unit: "g"
    }
  };
};

const buildMacroBreakdown = async (userId: string): Promise<VisualizationPayload | null> => {
  const snapshots = await listSnapshots(userId, 1);
  const latest = snapshots[0];
  if (!latest) {
    return null;
  }
  return {
    type: "macro_breakdown",
    title: "Macro intake today",
    timePeriod: "today",
    description: "Pie chart representing the distribution of calories from protein, carbs, and fats.",
    data: {
      labels: ["Protein", "Carbs", "Fats"],
      values: [
        Number(latest.totals.protein.toFixed(1)),
        Number(latest.totals.carbs.toFixed(1)),
        Number(latest.totals.fats.toFixed(1))
      ],
      calories: Number(latest.totals.calories.toFixed(0))
    }
  };
};

const buildSleepComparison = async (
  userId: string,
  timePeriod: string
): Promise<VisualizationPayload | null> => {
  const limit = timePeriod === "30d" ? 30 : 14;
  const snapshots = await listProcessedMetrics(userId, limit);
  const series = snapshots
    .map((entry) => {
      const metrics = (entry.userMetrics ?? {}) as Record<string, unknown>;
      const habits = (metrics.habits ?? {}) as Record<string, unknown>;
      const targets = (metrics.target_state ?? metrics.targets ?? {}) as Record<string, unknown>;
      const actual = toNumber(habits.sleep_hours ?? habits.sleepHours);
      const target =
        toNumber(targets.sleep_hours ?? targets.sleepHours) ??
        toNumber((metrics.current_state as Record<string, unknown> | undefined)?.sleep_target) ??
        7;
      if (actual == null) {
        return null;
      }
      return {
        date: entry.createdAt.toDate().toISOString().slice(0, 10),
        actual,
        target: target ?? 7
      };
    })
    .filter((point): point is { date: string; actual: number; target: number } => Boolean(point))
    .reverse();

  if (!series.length) {
    return null;
  }

  return {
    type: "sleep_vs_target",
    title: "Sleep duration vs. target",
    timePeriod,
    description: "Line chart comparing your logged sleep to the nightly goal.",
    data: {
      series
    }
  };
};

export const buildVisualizationPayload = async (
  userId: string,
  params: VisualizationRequest
): Promise<VisualizationPayload | null> => {
  switch (params.type) {
    case "weight_trend":
      return buildWeightTrend(userId, params.timePeriod ?? "30d");
    case "protein_vs_target":
      return buildProteinComparison(userId, params.timePeriod ?? "7d");
    case "macro_breakdown":
      return buildMacroBreakdown(userId);
    case "sleep_vs_target":
      return buildSleepComparison(userId, params.timePeriod ?? "14d");
    default:
      return null;
  }
};
