import { Router } from "express";
import { authContext } from "../middleware/auth-context.js";
import {
  searchRecipes,
  getRecipe,
  listReviews,
  createReview
} from "../services/nutrition-rag.service.js";
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
    const reviews = await listReviews(req.params.id, Number(req.query.limit) || 20);
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
