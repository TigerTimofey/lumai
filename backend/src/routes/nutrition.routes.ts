import { Router } from "express";
import type { RecipeReviewDocument } from "../domain/types.js";
import { authContext } from "../middleware/auth-context.js";
import {
  searchRecipes,
  getRecipe,
  listReviews,
  createReview,
  moderateReview
} from "../services/nutrition-rag.service.js";
import {
  fetchNutritionPreferences,
  updateNutritionPreferences
} from "../services/nutrition-preferences.service.js";
import {
  generateMealPlan,
  listUserMealPlans,
  regenerateMealPlan,
  regenerateMeal,
  swapMeals,
  addManualMeal,
  generateMealAlternatives
} from "../services/meal-planning.service.js";
import {
  generateShoppingList,
  updateShoppingListItem,
  removeShoppingListItem,
  listShoppingLists,
  getShoppingList
} from "../services/shopping-list.service.js";
import {
  createSnapshotFromPlan,
  getSnapshots,
  logMealConsumption,
  unlogMealConsumption
} from "../services/nutrition-snapshot.service.js";
import { getMicronutrientSummary } from "../services/nutrition-analytics.service.js";
import { badRequest, notFound } from "../utils/api-error.js";

const router = Router();

router.use(authContext);

router.get("/recipes", async (req, res, next) => {
  try {
    const filters = {
      query: req.query.q?.toString(),
      cuisine: req.query.cuisine ? req.query.cuisine.toString().split(",") : undefined,
      dietaryTags: req.query.diet ? req.query.diet.toString().split(",") : undefined,
      excludeAllergens: req.query.excludeAllergens
        ? req.query.excludeAllergens.toString().split(",")
        : undefined,
      calories: buildRange(req.query.minCalories, req.query.maxCalories),
      protein: buildRange(req.query.minProtein, req.query.maxProtein),
      carbs: buildRange(req.query.minCarbs, req.query.maxCarbs),
      fats: buildRange(req.query.minFats, req.query.maxFats),
      limit: req.query.limit ? Number(req.query.limit) : undefined
    };
    const results = await searchRecipes(filters);
    return res.json({ results });
  } catch (error) {
    return next(error);
  }
});

router.get("/preferences", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw badRequest("Missing user context");
    }
    const prefs = await fetchNutritionPreferences(userId);
    return res.json(prefs);
  } catch (error) {
    return next(error);
  }
});

router.put("/preferences", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw badRequest("Missing user context");
    }
    const prefs = await updateNutritionPreferences(userId, req.body ?? {});
    return res.json(prefs);
  } catch (error) {
    return next(error);
  }
});

router.get("/meal-plans", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const plans = await listUserMealPlans(userId, Number(req.query.limit) || 5);
    return res.json({ plans });
  } catch (error) {
    return next(error);
  }
});

router.get("/micronutrients/summary", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const summary = await getMicronutrientSummary(userId);
    return res.json(summary);
  } catch (error) {
    return next(error);
  }
});

router.post("/meal-plans", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const { duration = "weekly", startDate = new Date().toISOString().slice(0, 10) } = req.body ?? {};
    const plan = await generateMealPlan(userId, { duration, startDate });
    return res.status(201).json(plan);
  } catch (error) {
    return next(error);
  }
});

router.post("/meal-plans/:planId/regenerate", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const plan = await regenerateMealPlan(userId, req.params.planId);
    return res.json(plan);
  } catch (error) {
    return next(error);
  }
});

router.post("/meal-plans/:planId/days/:date/meals/:mealId/regenerate", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const plan = await regenerateMeal(
      userId,
      req.params.planId,
      req.params.date,
      req.params.mealId,
      { micronutrientFocus: req.body?.micronutrientFocus, recipeId: req.body?.recipeId }
    );
    return res.json(plan);
  } catch (error) {
    return next(error);
  }
});

router.post("/meal-plans/:planId/days/:date/meals/:mealId/swap", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const { targetDate, targetMealId } = req.body ?? {};
    if (!targetDate || !targetMealId) throw badRequest("targetDate and targetMealId are required");
    const plan = await swapMeals(
      userId,
      req.params.planId,
      req.params.date,
      req.params.mealId,
      targetDate,
      targetMealId
    );
    return res.json(plan);
  } catch (error) {
    return next(error);
  }
});

router.post("/meal-plans/:planId/days/:date/meals", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const plan = await addManualMeal(userId, req.params.planId, req.params.date, req.body ?? {});
    return res.json(plan);
  } catch (error) {
    return next(error);
  }
});

router.post("/meal-plans/:planId/days/:date/meals/:mealId/log", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const snapshot = await logMealConsumption(userId, req.params.planId, req.params.date, req.params.mealId);
    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});

router.delete("/meal-plans/:planId/days/:date/meals/:mealId/log", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const snapshot = await unlogMealConsumption(userId, req.params.planId, req.params.date, req.params.mealId);
    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});

router.get("/meal-plans/:planId/alternatives", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const micronutrient = req.query.micronutrient?.toString();
    const recipes = await generateMealAlternatives(userId, req.query.q?.toString() ?? "healthy meal", micronutrient as any);
    return res.json({ recipes });
  } catch (error) {
    return next(error);
  }
});

router.post("/shopping-lists", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const { mealPlanId } = req.body ?? {};
    if (!mealPlanId) throw badRequest("mealPlanId is required");
    const list = await generateShoppingList(userId, mealPlanId);
    return res.status(201).json(list);
  } catch (error) {
    return next(error);
  }
});

router.get("/shopping-lists", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const lists = await listShoppingLists(userId, Number(req.query.limit) || 5);
    return res.json({ lists });
  } catch (error) {
    return next(error);
  }
});

router.get("/shopping-lists/:listId", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const list = await getShoppingList(userId, req.params.listId);
    if (!list) throw notFound("Shopping list not found");
    return res.json(list);
  } catch (error) {
    return next(error);
  }
});

router.patch("/shopping-lists/:listId/items/:itemId", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const list = await updateShoppingListItem(userId, req.params.listId, req.params.itemId, req.body ?? {});
    return res.json(list);
  } catch (error) {
    return next(error);
  }
});

router.delete("/shopping-lists/:listId/items/:itemId", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const list = await removeShoppingListItem(userId, req.params.listId, req.params.itemId);
    return res.json(list);
  } catch (error) {
    return next(error);
  }
});

router.post("/snapshots", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const { mealPlanId, date } = req.body ?? {};
    if (!mealPlanId || !date) throw badRequest("mealPlanId and date are required");
    const snapshot = await createSnapshotFromPlan(userId, mealPlanId, date);
    return res.status(201).json(snapshot);
  } catch (error) {
    return next(error);
  }
});

router.get("/snapshots", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) throw badRequest("Missing user context");
    const snapshots = await getSnapshots(userId, Number(req.query.limit) || 14);
    return res.json({ snapshots });
  } catch (error) {
    return next(error);
  }
});
router.get("/recipes/:id", async (req, res, next) => {
  try {
    const recipe = await getRecipe(req.params.id);
    if (!recipe) {
      throw notFound("Recipe not found");
    }
    return res.json(recipe);
  } catch (error) {
    return next(error);
  }
});

router.get("/recipes/:id/reviews", async (req, res, next) => {
  try {
    const status = req.query.status?.toString() as
      | RecipeReviewDocument["moderationStatus"]
      | undefined;
    const reviews = await listReviews(req.params.id, Number(req.query.limit) || 20, status);
    return res.json({ reviews });
  } catch (error) {
    return next(error);
  }
});

router.post("/recipes/:id/reviews", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw badRequest("Missing user context");
    }
    const { rating, comment } = req.body ?? {};
    if (rating == null) {
      throw badRequest("rating is required");
    }
    const reviewId = await createReview(req.params.id, userId, Number(rating), comment);
    return res.status(201).json({ reviewId });
  } catch (error) {
    return next(error);
  }
});

router.patch("/recipes/:id/reviews/:reviewId/moderate", async (req, res, next) => {
  try {
    const moderatorId = req.authToken?.uid;
    if (!moderatorId) throw badRequest("Missing user context");
    const { status, notes } = req.body ?? {};
    if (!status) throw badRequest("status is required");
    await moderateReview(req.params.id, req.params.reviewId, status, moderatorId, notes);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

const buildRange = (min?: unknown, max?: unknown) => {
  const range = {
    min: min != null ? Number(min) : undefined,
    max: max != null ? Number(max) : undefined
  };
  if (range.min == null && range.max == null) {
    return undefined;
  }
  return range;
};

export default router;
