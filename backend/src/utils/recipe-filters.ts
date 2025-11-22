import type {
  HealthProfileDocument,
  NutritionPreferencesDocument
} from "../domain/types.js";
import type { RecipeSearchFilters } from "../services/nutrition-rag.service.js";

type Range = {
  min?: number;
  max?: number;
};

const mergeRange = (current: Range | undefined, incoming: Range): Range => {
  const result: Range = { ...current };
  if (incoming.min != null) {
    result.min = result.min != null ? Math.max(result.min, incoming.min) : incoming.min;
  }
  if (incoming.max != null) {
    result.max = result.max != null ? Math.min(result.max, incoming.max) : incoming.max;
  }
  return result;
};

const getNormalized = (profile: HealthProfileDocument | null | undefined) =>
  profile?.current?.normalized ?? null;

const getLifestyle = (profile: HealthProfileDocument | null | undefined) =>
  profile?.current?.lifestyle ??
  ({} as Partial<HealthProfileDocument["current"]["lifestyle"]>);

const getGoals = (profile: HealthProfileDocument | null | undefined) =>
  profile?.current?.goals ?? ({} as Partial<HealthProfileDocument["current"]["goals"]>);

export const buildHealthAwareRecipeFilters = (
  preferences: NutritionPreferencesDocument,
  profile: HealthProfileDocument | null,
  overrides: Partial<RecipeSearchFilters> = {}
): RecipeSearchFilters => {
  const filters: RecipeSearchFilters = {
    dietaryTags: preferences.dietaryPreferences,
    excludeAllergens: preferences.allergies,
    cuisine: preferences.cuisinePreferences,
    ...overrides
  };

  const normalized = getNormalized(profile);
  const lifestyle = getLifestyle(profile);
  const goals = getGoals(profile);

  const bmi = normalized?.bmi ?? null;
  const weight = normalized?.weightKg ?? null;
  const targetWeight = typeof goals.targetWeightKg === "number" ? goals.targetWeightKg : null;
  const activityLevel =
    typeof lifestyle.activityLevel === "string" ? lifestyle.activityLevel : null;

  if (bmi != null) {
    if (bmi >= 27) {
      filters.calories = mergeRange(filters.calories, { max: 600 });
      filters.fats = mergeRange(filters.fats, { max: 30 });
      filters.protein = mergeRange(filters.protein, { min: 25 });
    } else if (bmi <= 19) {
      filters.calories = mergeRange(filters.calories, { min: 500 });
    }
  }

  if (weight != null && targetWeight != null) {
    const diff = targetWeight - weight;
    if (Math.abs(diff) > 1.5) {
      if (diff < 0) {
        filters.calories = mergeRange(filters.calories, { max: 650 });
        filters.protein = mergeRange(filters.protein, { min: 30 });
      } else {
        filters.calories = mergeRange(filters.calories, { min: 600 });
        filters.carbs = mergeRange(filters.carbs, { min: 40 });
      }
    }
  }

  if (activityLevel) {
    if (["very_active", "extra_active", "active"].includes(activityLevel)) {
      filters.protein = mergeRange(filters.protein, { min: 30 });
      filters.carbs = mergeRange(filters.carbs, { min: 35 });
    }
    if (activityLevel === "sedentary") {
      filters.calories = mergeRange(filters.calories, { max: 550 });
    }
  }

  if (overrides.micronutrientFocus) {
    const focus = overrides.micronutrientFocus;
    const target = preferences.micronutrientTargets?.[focus] ?? 10;
    const minimum = Math.max(0.5, target * 0.15);
    filters.micronutrients = {
      ...(filters.micronutrients ?? {}),
      [focus]: mergeRange(filters.micronutrients?.[focus], { min: minimum })
    };
  }

  return filters;
};
