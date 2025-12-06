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

export type VisualizationType = "weight_trend" | "protein_vs_target" | "macro_breakdown";

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
    default:
      return null;
  }
};
