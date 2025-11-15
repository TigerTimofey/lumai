import type { RecipeDocument, RecipeIngredient } from "../domain/types.js";
import { getRecipeById } from "../repositories/nutrition.repo.js";

export interface NutritionCalculationResult {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  micronutrients: Record<string, number>;
}

const sumNutrition = (ingredients: RecipeIngredient[], servings: number) => {
  const totals = ingredients.reduce(
    (acc, ingredient) => {
      const factor = ingredient.quantity / 100;
      acc.calories += ingredient.nutrition.calories * factor;
      acc.protein += ingredient.nutrition.protein * factor;
      acc.carbs += ingredient.nutrition.carbs * factor;
      acc.fats += ingredient.nutrition.fats * factor;
      acc.fiber += ingredient.nutrition.fiber * factor;
      acc.vitaminD += ingredient.nutrition.vitaminD * factor;
      acc.vitaminB12 += ingredient.nutrition.vitaminB12 * factor;
      acc.iron += ingredient.nutrition.iron * factor;
      acc.magnesium += ingredient.nutrition.magnesium * factor;
      return acc;
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
      vitaminD: 0,
      vitaminB12: 0,
      iron: 0,
      magnesium: 0
    }
  );

  return {
    calories: totals.calories / servings,
    protein: totals.protein / servings,
    carbs: totals.carbs / servings,
    fats: totals.fats / servings,
    fiber: totals.fiber / servings,
    micronutrients: {
      vitaminD: totals.vitaminD / servings,
      vitaminB12: totals.vitaminB12 / servings,
      iron: totals.iron / servings,
      magnesium: totals.magnesium / servings
    }
  };
};

export const calculateNutritionForRecipe = (recipe: RecipeDocument, servings: number): NutritionCalculationResult => {
  const scale = servings / recipe.servings;
  return {
    calories: recipe.macrosPerServing.calories * scale,
    protein: recipe.macrosPerServing.protein * scale,
    carbs: recipe.macrosPerServing.carbs * scale,
    fats: recipe.macrosPerServing.fats * scale,
    fiber: recipe.macrosPerServing.fiber * scale,
    micronutrients: {
      vitaminD: recipe.micronutrientsPerServing.vitaminD * scale,
      vitaminB12: recipe.micronutrientsPerServing.vitaminB12 * scale,
      iron: recipe.micronutrientsPerServing.iron * scale,
      magnesium: recipe.micronutrientsPerServing.magnesium * scale
    }
  };
};

export const calculateNutritionFromIngredients = (
  ingredients: RecipeIngredient[],
  servings: number
): NutritionCalculationResult => {
  return sumNutrition(ingredients, servings);
};

export const scaleIngredients = (ingredients: RecipeIngredient[], scale: number) =>
  ingredients.map((ingredient) => ({
    ...ingredient,
    quantity: Number((ingredient.quantity * scale).toFixed(2))
  }));

export const calculateNutritionByRecipeId = async (recipeId: string, servings: number) => {
  const recipe = await getRecipeById(recipeId);
  if (!recipe) {
    throw new Error("Recipe not found");
  }
  return calculateNutritionForRecipe(recipe, servings);
};
