import { listSnapshots } from "../repositories/calories.repo.js";
import { fetchNutritionPreferences } from "./nutrition-preferences.service.js";
import { searchRecipes } from "./nutrition-rag.service.js";
import { buildHealthAwareRecipeFilters } from "../utils/recipe-filters.js";

type MicronutrientKey = "vitaminD" | "vitaminB12" | "iron" | "magnesium";

export const getMicronutrientSummary = async (userId: string) => {
  const [preferences, snapshotsResponse] = await Promise.all([
    fetchNutritionPreferences(userId),
    listSnapshots(userId, 1)
  ]);
  const latest = snapshotsResponse[0];
  if (!latest) {
    return {
      totals: null,
      targets: preferences.micronutrientTargets ?? {},
      coverage: null,
      deficits: [],
      recommendations: [],
      recipeIdeas: []
    };
  }

  const targets = preferences.micronutrientTargets ?? {};
  const keys: MicronutrientKey[] = ["vitaminD", "vitaminB12", "iron", "magnesium"];
  const coverage: Record<string, number> = {};
  const deficits: string[] = [];
  const recommendations: string[] = [];

  keys.forEach((key) => {
    const total = latest.totals[key];
    const target = targets[key] ?? 0;
    if (!target) {
      coverage[key] = 0;
      return;
    }
    coverage[key] = Math.min(1.4, total / target);
    if (total < target * 0.8) {
      deficits.push(key);
      recommendations.push(`Add foods rich in ${translateMicronutrient(key)} to move closer to your target.`);
    }
  });

  let recipeIdeas: string[] = [];
  if (deficits.length) {
    const focus = deficits[0] as MicronutrientKey;
    const results = await searchRecipes(
      buildHealthAwareRecipeFilters(preferences, null, {
        query: `${translateMicronutrient(focus)} rich meal`,
        limit: 3,
        micronutrientFocus: focus
      })
    );
    recipeIdeas = results.map((entry) => entry.recipe.title);
  }

  return {
    date: latest.date,
    totals: latest.totals,
    targets,
    coverage,
    deficits,
    recommendations,
    recipeIdeas
  };
};

const translateMicronutrient = (key: MicronutrientKey) => {
  switch (key) {
    case "vitaminD":
      return "vitamin D";
    case "vitaminB12":
      return "vitamin B12";
    case "iron":
      return "iron";
    case "magnesium":
      return "magnesium";
    default:
      return key;
  }
};
