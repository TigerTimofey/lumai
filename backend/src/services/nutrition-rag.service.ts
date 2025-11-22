import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase.js";
import type { RecipeDocument, RecipeReviewDocument } from "../domain/types.js";
import {
  listRecipeEmbeddings,
  listRecipeReviews,
  addRecipeReview,
  updateReviewModeration,
  recalcRecipeRating
} from "../repositories/nutrition.repo.js";
import { cosineSimilarity, generateEmbedding } from "../utils/embedding.js";
import { FALLBACK_RECIPES } from "../data/fallback-recipes.js";
import { isVectorDbEnabled, vectorSearch } from "../utils/vector-client.js";

type MacroRange = {
  min?: number;
  max?: number;
};

type MicronutrientKey = keyof RecipeDocument["micronutrientsPerServing"];

export type RecipeSearchFilters = {
  query?: string;
  cuisine?: string[];
  dietaryTags?: string[];
  excludeAllergens?: string[];
  calories?: MacroRange;
  protein?: MacroRange;
  carbs?: MacroRange;
  fats?: MacroRange;
  micronutrients?: Partial<Record<MicronutrientKey, MacroRange>>;
  micronutrientFocus?: MicronutrientKey;
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
  if (filters.micronutrients) {
    const keys = Object.keys(filters.micronutrients) as MicronutrientKey[];
    for (const key of keys) {
      const range = filters.micronutrients[key];
      const value = recipe.micronutrientsPerServing?.[key] ?? 0;
      if (!matchesMacroRange(value, range)) {
        return false;
      }
    }
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
  const recipesSnapshot = await firestore().collection("recipes_master").get();
  const recipesById = new Map<string, RecipeDocument>(
    recipesSnapshot.docs.map((doc) => [doc.id, doc.data() as RecipeDocument])
  );

  const scored: Array<{ recipe: RecipeDocument; similarity: number; score: number }> = [];

  if (isVectorDbEnabled()) {
    const results = await vectorSearch(queryVector, limit * 3);
    results.forEach((match) => {
      const recipe = recipesById.get(match.id);
      if (!recipe) return;
      if (!matchesFilters(recipe, filters)) return;
      scored.push({
        recipe,
        similarity: match.score,
        score: match.score * (1 + (recipe.ratingAverage - 3) / 5)
      });
    });
  }

  if (!scored.length) {
    const embeddings = await listRecipeEmbeddings();
    const fallbackScored = await Promise.all(
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
    scored.push(
      ...(fallbackScored.filter(Boolean) as Array<{ recipe: RecipeDocument; similarity: number; score: number }>)
    );
  }

  let ranked = scored;

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

export const listReviews = async (
  recipeId: string,
  limit = 20,
  status?: RecipeReviewDocument["moderationStatus"]
) => {
  return listRecipeReviews(recipeId, limit, status);
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

export const moderateReview = async (
  recipeId: string,
  reviewId: string,
  status: RecipeReviewDocument["moderationStatus"],
  moderatorId: string,
  notes?: string
) => {
  if (!["approved", "rejected", "pending"].includes(status)) {
    throw new Error("Invalid status");
  }
  await updateReviewModeration(recipeId, reviewId, {
    moderationStatus: status,
    moderationNotes: notes,
    moderatedBy: moderatorId,
    moderatedAt: Timestamp.now()
  });
  await recalcRecipeRating(recipeId);
};
