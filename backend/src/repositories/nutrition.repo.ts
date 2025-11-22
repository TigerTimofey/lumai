import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase.js";
import type {
  IngredientDocument,
  RecipeDocument,
  RecipeEmbeddingDocument,
  RecipeReviewDocument
} from "../domain/types.js";

const ingredientCollection = () => firestore().collection("ingredients_master");
const recipeCollection = () => firestore().collection("recipes_master");
const embeddingCollection = () => firestore().collection("recipe_embeddings");
const recipeRatingCollection = (recipeId: string) =>
  firestore().collection("recipe_ratings").doc(recipeId).collection("reviews");

export const upsertIngredient = async (ingredient: Omit<IngredientDocument, "createdAt" | "updatedAt">) => {
  const now = Timestamp.now();
  await ingredientCollection()
    .doc(ingredient.id)
    .set(
      {
        ...ingredient,
        createdAt: now,
        updatedAt: now
      },
      { merge: true }
    );
};

export const upsertRecipe = async (
  recipe: Omit<
    RecipeDocument,
    "createdAt" | "updatedAt" | "ratingAverage" | "ratingCount" | "ratingSum"
  >
) => {
  const now = Timestamp.now();
  await recipeCollection()
    .doc(recipe.id)
    .set(
      {
        ...recipe,
        ratingAverage: 0,
        ratingCount: 0,
        ratingSum: 0,
        createdAt: now,
        updatedAt: now
      },
      { merge: true }
    );
};

export const saveRecipeEmbedding = async (
  embedding: Omit<RecipeEmbeddingDocument, "createdAt" | "id">
) => {
  const now = Timestamp.now();
  const doc = embeddingCollection().doc(embedding.recipeId);
  await doc.set({
    ...embedding,
    id: doc.id,
    createdAt: now
  });
};

export const getRecipeById = async (recipeId: string) => {
  const snapshot = await recipeCollection().doc(recipeId).get();
  return snapshot.exists ? (snapshot.data() as RecipeDocument) : null;
};

export const listRecipesByIds = async (ids: string[]) => {
  if (ids.length === 0) return [];
  const chunkSize = 10;
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }
  const snapshots = await Promise.all(
    chunks.map((chunk) => recipeCollection().where("id", "in", chunk).get())
  );
  return snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => doc.data() as RecipeDocument));
};

export const listRecipeEmbeddings = async () => {
  const snapshot = await embeddingCollection().get();
  return snapshot.docs.map((doc) => doc.data() as RecipeEmbeddingDocument);
};

export const getRecipeEmbedding = async (recipeId: string) => {
  const snapshot = await embeddingCollection().doc(recipeId).get();
  return snapshot.exists ? (snapshot.data() as RecipeEmbeddingDocument) : null;
};

export const addRecipeReview = async (
  recipeId: string,
  review: Omit<RecipeReviewDocument, "id" | "createdAt" | "moderationStatus">
) => {
  const now = Timestamp.now();
  const docRef = recipeRatingCollection(recipeId).doc();
  await docRef.set({
    ...review,
    id: docRef.id,
    recipeId,
    createdAt: now,
    moderationStatus: "pending"
  });
  const recipeRef = recipeCollection().doc(recipeId);
  await firestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(recipeRef);
    const data = snapshot.data() as RecipeDocument | undefined;
    const ratingCount = (data?.ratingCount ?? 0) + 1;
    const ratingSum = (data?.ratingSum ?? 0) + review.rating;
    const ratingAverage = ratingSum / ratingCount;
    tx.set(
      recipeRef,
      {
        ratingCount,
        ratingSum,
        ratingAverage,
        updatedAt: now
      },
      { merge: true }
    );
  });
  return docRef.id;
};

export const listRecipeReviews = async (recipeId: string, limit = 20) => {
  const snapshot = await recipeRatingCollection(recipeId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.data() as RecipeReviewDocument);
};

export const updateRecipeRatingSummary = async (
  recipeId: string,
  ratingAverage: number,
  ratingCount: number
) => {
  await recipeCollection().doc(recipeId).set(
    {
      ratingAverage,
      ratingCount,
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );
};
