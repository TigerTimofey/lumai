import { firestore } from "../config/firebase.js";
import type { RecipeDocument } from "../domain/types.js";
import { listRecipeEmbeddings, listRecipeReviews, addRecipeReview } from "../repositories/nutrition.repo.js";
import { cosineSimilarity, generateEmbedding } from "../utils/embedding.js";
import { FALLBACK_RECIPES } from "../data/fallback-recipes.js";

type MacroRange = {
  min?: number;
  max?: number;
};

export type RecipeSearchFilters = {
  query?: string;
  cuisine?: string[];
  dietaryTags?: string[];
  excludeAllergens?: string[];
  calories?: MacroRange;
  protein?: MacroRange;
  carbs?: MacroRange;
  fats?: MacroRange;
  limit?: number;
};

const matchesMacroRange = (value: number, range?: MacroRange) => {
  if (!range) return true;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
};

const matchesFilters = (recipe: RecipeDocument, filters: RecipeSearchFilters) => {
  if (filters.cuisine?.length && !filters.cuisine.includes(recipe.cuisine)) {
    return false;
  }
  if (
    filters.dietaryTags?.length &&
    !filters.dietaryTags.some((tag) => recipe.dietaryTags.includes(tag))
  ) {
    return false;
  }
  if (
    filters.excludeAllergens?.length &&
    filters.excludeAllergens.some((allergen) => recipe.allergenTags.includes(allergen))
  ) {
    return false;
  }
  if (!matchesMacroRange(recipe.macrosPerServing.calories, filters.calories)) {
    return false;
  }
  if (!matchesMacroRange(recipe.macrosPerServing.protein, filters.protein)) {
    return false;
  }
  if (!matchesMacroRange(recipe.macrosPerServing.carbs, filters.carbs)) {
    return false;
  }
  if (!matchesMacroRange(recipe.macrosPerServing.fats, filters.fats)) {
    return false;
  }
  return true;
};

const buildQueryText = (filters: RecipeSearchFilters) => {
  const parts = [filters.query?.trim() ?? ""];
  if (filters.cuisine?.length) {
    parts.push(`Cuisine: ${filters.cuisine.join(", ")}`);
  }
  if (filters.dietaryTags?.length) {
    parts.push(`Diet: ${filters.dietaryTags.join(", ")}`);
  }
  return parts.filter(Boolean).join(". ");
};

export const searchRecipes = async (filters: RecipeSearchFilters) => {
  const limit = filters.limit ?? 10;
  const queryText = buildQueryText(filters) || "balanced healthy meal";
  const queryVector = await generateEmbedding(queryText);
  const embeddings = await listRecipeEmbeddings();
  const recipesSnapshot = await firestore().collection("recipes_master").get();
  const recipesById = new Map<string, RecipeDocument>(
    recipesSnapshot.docs.map((doc) => [doc.id, doc.data() as RecipeDocument])
  );

  const scored = await Promise.all(
    embeddings.map(async (embedding) => {
      const recipe = recipesById.get(embedding.recipeId);
      if (!recipe) return null;
      if (!matchesFilters(recipe, filters)) return null;
      const similarity = cosineSimilarity(queryVector, embedding.vector);
      const ratingFactor = 1 + (recipe.ratingAverage - 3) / 5;
      return {
        recipe,
        similarity,
        score: similarity * ratingFactor
      };
    })
  );

  let ranked = (scored.filter(Boolean) as Array<{ recipe: RecipeDocument; similarity: number; score: number }>);

  if (!ranked.length) {
    const fallbackMatches = FALLBACK_RECIPES.filter((recipe) => matchesFilters(recipe, filters));
    ranked = fallbackMatches.map((recipe, index) => ({
      recipe,
      similarity: 0.4 - index * 0.01,
      score: 0.4 - index * 0.01
    }));
  }

  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
};

export const getRecipe = async (recipeId: string) => {
  const snapshot = await firestore().collection("recipes_master").doc(recipeId).get();
  if (snapshot.exists) {
    return snapshot.data() as RecipeDocument;
  }
  return FALLBACK_RECIPES.find((recipe) => recipe.id === recipeId) ?? null;
};

export const listReviews = async (recipeId: string, limit = 20) => {
  return listRecipeReviews(recipeId, limit);
};

export const createReview = async (recipeId: string, userId: string, rating: number, comment?: string) => {
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }
  return addRecipeReview(recipeId, {
    recipeId,
    userId,
    rating,
    comment
  });
};
