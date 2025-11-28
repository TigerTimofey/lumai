import { runPromptStep } from "./ai.service.js";
import { fetchNutritionPreferences } from "./nutrition-preferences.service.js";
import { getRecipe } from "./nutrition-rag.service.js";
import { badRequest } from "../utils/api-error.js";

type IngredientSubstitution = {
  name: string;
  reason?: string;
  availabilityMatch?: string;
  nutritionNote?: string;
};

type IngredientSubstitutionOptions = {
  recipeId?: string;
  ingredient: string;
  availability?: string;
};

const formatMacrosSummary = (macros?: {
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
}) => {
  if (!macros) return "";
  const parts = [];
  if (typeof macros.calories === "number") parts.push(`${Math.round(macros.calories)} kcal`);
  if (typeof macros.protein === "number") parts.push(`${Math.round(macros.protein)}g protein`);
  if (typeof macros.carbs === "number") parts.push(`${Math.round(macros.carbs)}g carbs`);
  if (typeof macros.fats === "number") parts.push(`${Math.round(macros.fats)}g fats`);
  return parts.join(", ");
};

const buildAvailabilityString = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .join(", ");

export const generateIngredientSubstitutions = async (
  userId: string,
  options: IngredientSubstitutionOptions
): Promise<IngredientSubstitution[]> => {
  const ingredient = options.ingredient?.trim();
  if (!ingredient) {
    throw badRequest("Ingredient is required for substitutions");
  }

  const [preferences, recipe] = await Promise.all([
    userId ? fetchNutritionPreferences(userId) : null,
    options.recipeId ? getRecipe(options.recipeId) : Promise.resolve(null)
  ]);

  const availability = buildAvailabilityString(options.availability);
  const promptResult = await runPromptStep({
    step: "substitutions",
    userProfile: {
      timezone: preferences?.timezone ?? "UTC",
      cuisinePreferences: preferences?.cuisinePreferences ?? [],
      dislikedIngredients: preferences?.dislikedIngredients ?? []
    },
    dietaryPreferences: preferences?.dietaryPreferences ?? [],
    allergies: preferences?.allergies ?? [],
    targets: {
      calorieTarget: preferences?.calorieTarget ?? null,
      macronutrientTargets: preferences?.macronutrientTargets ?? {}
    },
    ingredient,
    availability: availability || "unspecified",
    recipeTitle: recipe ? `${recipe.title} (${recipe.cuisine ?? "Any cuisine"})` : "Custom recipe",
    recipeSummary: recipe?.summary ?? recipe?.meal ?? "",
    recipeMacros: recipe ? formatMacrosSummary(recipe.macrosPerServing) : "",
    restrictions: (preferences?.dietaryRestrictions ?? []).join(", "),
    temperature: 0.5,
    topP: 0.9,
    maxTokens: 400
  });

  let parsed: Record<string, unknown> = {};
  if (promptResult?.content) {
    try {
      parsed = JSON.parse(promptResult.content);
    } catch {
      parsed = {};
    }
  }

  const alternatives = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
  const normalized = alternatives
    .map((entry, index) => {
      const item = entry as Record<string, unknown>;
      const name =
        typeof item.name === "string" && item.name.trim().length
          ? item.name.trim()
          : `Alternative ${index + 1}`;
      return {
        name,
        reason: typeof item.reason === "string" ? item.reason : undefined,
        availabilityMatch:
          typeof item.availabilityMatch === "string" ? item.availabilityMatch : undefined,
        nutritionNote:
          typeof item.nutritionNote === "string" ? item.nutritionNote : undefined
      };
    })
    .filter((item) => item.name)
    .slice(0, 4);

  return normalized;
};
