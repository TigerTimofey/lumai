import { randomUUID } from "crypto";
import type { ShoppingListDocument, ShoppingListItem } from "../domain/types.js";
import {
  getMealPlan,
  saveShoppingList,
  updateShoppingList,
  getShoppingList as repoGetShoppingList,
  listShoppingLists as repoListShoppingLists
} from "../repositories/calories.repo.js";
import { listRecipesByIds } from "../repositories/nutrition.repo.js";
import { notFound } from "../utils/api-error.js";

const CATEGORY_MAP: Record<string, string> = {
  meat: "Protein",
  fish: "Protein",
  dairy: "Dairy",
  grain: "Grains",
  vegetable: "Produce",
  fruit: "Produce",
  legume: "Pantry",
  nuts: "Pantry",
  oils: "Pantry",
  spice: "Pantry",
  sweetener: "Pantry"
};

export const generateShoppingList = async (userId: string, planId: string) => {
  const plan = await getMealPlan(userId, planId);
  if (!plan) throw notFound("Meal plan not found");
  const recipeIds = Array.from(
    new Set(
      plan.days
        .flatMap((day) => day.meals.map((meal) => meal.recipeId))
        .filter((id): id is string => Boolean(id))
    )
  );
  const recipes = await listRecipesByIds(recipeIds);
  const itemsMap = new Map<string, ShoppingListItem>();

  recipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
      const key = ingredient.id;
      const category = CATEGORY_MAP[ingredient.category as keyof typeof CATEGORY_MAP] ?? "Other";
      const existing = itemsMap.get(key);
      if (existing) {
        existing.quantity += ingredient.quantity;
      } else {
        itemsMap.set(key, {
          id: key,
          ingredientId: ingredient.id,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: "g",
          category,
          checked: false
        });
      }
    });
  });

  const list: Omit<ShoppingListDocument, "generatedAt" | "updatedAt"> = {
    id: randomUUID(),
    userId,
    mealPlanId: planId,
    items: Array.from(itemsMap.values())
  };

  await saveShoppingList(userId, list);
  return repoGetShoppingList(userId, list.id);
};

export const updateShoppingListItem = async (
  userId: string,
  listId: string,
  itemId: string,
  updates: Partial<ShoppingListItem>
) => {
  const list = await repoGetShoppingList(userId, listId);
  if (!list) throw notFound("Shopping list not found");
  list.items = list.items.map((item) => (item.id === itemId ? { ...item, ...updates } : item));
  await updateShoppingList(userId, listId, { items: list.items });
  return repoGetShoppingList(userId, listId);
};

export const removeShoppingListItem = async (userId: string, listId: string, itemId: string) => {
  const list = await repoGetShoppingList(userId, listId);
  if (!list) throw notFound("Shopping list not found");
  list.items = list.items.filter((item) => item.id !== itemId);
  await updateShoppingList(userId, listId, { items: list.items });
  return repoGetShoppingList(userId, listId);
};

export const listShoppingLists = (userId: string, limit = 5) => repoListShoppingLists(userId, limit);

export const getShoppingList = (userId: string, listId: string) => repoGetShoppingList(userId, listId);
