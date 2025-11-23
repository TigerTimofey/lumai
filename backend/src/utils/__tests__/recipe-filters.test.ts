import { describe, expect, it } from "vitest";
import type { HealthProfileDocument, NutritionPreferencesDocument } from "../../domain/types.js";
import { buildHealthAwareRecipeFilters } from "../recipe-filters.js";

const preferences: NutritionPreferencesDocument = {
  userId: "user",
  timezone: "UTC",
  dietaryPreferences: [],
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
  cuisinePreferences: [],
  calorieTarget: 2000,
  macronutrientTargets: { protein: 120, carbs: 220, fats: 60 },
  micronutrientTargets: {
    vitaminD: 15,
    vitaminB12: 2.4,
    iron: 18,
    magnesium: 420
  },
  mealsPerDay: 3,
  preferredMealTimes: {},
  createdAt: {} as any,
  updatedAt: {} as any
};

const profile: HealthProfileDocument = {
  current: {
    demographics: {} as any,
    physicalMetrics: {} as any,
    lifestyle: { activityLevel: "active" } as any,
    goals: { targetWeightKg: 68 } as any,
    assessment: {} as any,
    habits: {} as any,
    normalized: {
      heightCm: 170,
      weightKg: 82,
      bmi: 28.4
    },
    updatedAt: {} as any
  },
  targets: { targetWeightKg: 68, targetActivityLevel: "active" },
  stats: { versionsCount: 1, lastUpdated: {} as any }
};

describe("buildHealthAwareRecipeFilters", () => {
  it("tightens calorie range for high BMI", () => {
    const filters = buildHealthAwareRecipeFilters(preferences, profile);
    expect(filters.calories?.max).toBeLessThanOrEqual(600);
    expect(filters.protein?.min).toBeGreaterThanOrEqual(25);
  });

  it("adds micronutrient focus when provided", () => {
    const filters = buildHealthAwareRecipeFilters(preferences, profile, {
      micronutrientFocus: "iron"
    });
    expect(filters.micronutrients?.iron?.min).toBeGreaterThan(0);
  });

  it("passes disliked ingredients to excludeIngredients", () => {
    const pickyPreferences: NutritionPreferencesDocument = {
      ...preferences,
      dislikedIngredients: ["beets", "anchovies"]
    };
    const filters = buildHealthAwareRecipeFilters(pickyPreferences, profile);
    expect(filters.excludeIngredients).toEqual(["beets", "anchovies"]);
  });
});
