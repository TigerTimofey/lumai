import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase.js";
import type {
  NutritionPreferencesDocument,
  MealPlanDocument,
  ShoppingListDocument,
  NutritionalSnapshotDocument
} from "../domain/types.js";

const caloriesCollection = () => firestore().collection("calories");

const preferencesDoc = (userId: string) =>
  caloriesCollection().doc(userId).collection("preferences").doc("current");

const mealPlansCollection = (userId: string) =>
  caloriesCollection().doc(userId).collection("mealPlans");

const shoppingListCollection = (userId: string) =>
  caloriesCollection().doc(userId).collection("shoppingLists");

const snapshotsCollection = (userId: string) =>
  caloriesCollection().doc(userId).collection("nutritionLogs");

export const getNutritionPreferences = async (userId: string) => {
  const snapshot = await preferencesDoc(userId).get();
  return snapshot.exists ? (snapshot.data() as NutritionPreferencesDocument) : null;
};

export const upsertNutritionPreferences = async (
  userId: string,
  payload: Omit<NutritionPreferencesDocument, "userId" | "createdAt" | "updatedAt">
) => {
  const now = Timestamp.now();
  const docRef = preferencesDoc(userId);
  await docRef.set(
    {
      ...payload,
      userId,
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  );
  const snapshot = await docRef.get();
  return snapshot.data() as NutritionPreferencesDocument;
};

export const createMealPlan = async (userId: string, plan: Omit<MealPlanDocument, "createdAt" | "updatedAt">) => {
  const now = Timestamp.now();
  await mealPlansCollection(userId).doc(plan.id).set({
    ...plan,
    createdAt: now,
    updatedAt: now
  });
  return plan;
};

export const updateMealPlan = async (
  userId: string,
  planId: string,
  data: Partial<Omit<MealPlanDocument, "id" | "userId" | "createdAt">>
) => {
  await mealPlansCollection(userId)
    .doc(planId)
    .set(
      {
        ...data,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    );
};

export const getMealPlan = async (userId: string, planId: string) => {
  const snapshot = await mealPlansCollection(userId).doc(planId).get();
  return snapshot.exists ? (snapshot.data() as MealPlanDocument) : null;
};

export const listMealPlans = async (userId: string, limit = 10) => {
  const snapshot = await mealPlansCollection(userId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.data() as MealPlanDocument);
};

export const saveShoppingList = async (
  userId: string,
  list: Omit<ShoppingListDocument, "generatedAt" | "updatedAt">
) => {
  const now = Timestamp.now();
  await shoppingListCollection(userId).doc(list.id).set({
    ...list,
    generatedAt: now,
    updatedAt: now
  });
  return list;
};

export const updateShoppingList = async (
  userId: string,
  listId: string,
  data: Partial<Omit<ShoppingListDocument, "id" | "userId" | "generatedAt">>
) => {
  await shoppingListCollection(userId)
    .doc(listId)
    .set(
      {
        ...data,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    );
};

export const getShoppingList = async (userId: string, listId: string) => {
  const snapshot = await shoppingListCollection(userId).doc(listId).get();
  return snapshot.exists ? (snapshot.data() as ShoppingListDocument) : null;
};

export const listShoppingLists = async (userId: string, limit = 10) => {
  const snapshot = await shoppingListCollection(userId)
    .orderBy("generatedAt", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.data() as ShoppingListDocument);
};

export const recordSnapshot = async (
  userId: string,
  snapshot: Omit<NutritionalSnapshotDocument, "id" | "createdAt" | "updatedAt">,
  options?: { merge?: boolean }
) => {
  const doc = snapshotsCollection(userId).doc(snapshot.date);
  const existing = await doc.get();
  const now = Timestamp.now();
  const createdAt = existing.exists
    ? ((existing.data()?.createdAt as Timestamp | undefined) ?? now)
    : now;
  await doc.set(
    {
      ...snapshot,
      id: doc.id,
      createdAt,
      updatedAt: now
    },
    { merge: options?.merge ?? false }
  );
};

export const getSnapshot = async (userId: string, date: string) => {
  const snapshot = await snapshotsCollection(userId).doc(date).get();
  return snapshot.exists ? (snapshot.data() as NutritionalSnapshotDocument) : null;
};

export const deleteSnapshot = async (userId: string, date: string) => {
  await snapshotsCollection(userId).doc(date).delete();
};

export const listSnapshots = async (userId: string, limit = 14) => {
  const snapshot = await snapshotsCollection(userId)
    .orderBy("date", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.data() as NutritionalSnapshotDocument);
};
