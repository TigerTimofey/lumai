import path from "path";
import { readFile } from "fs/promises";
import { parse } from "csv-parse/sync";
import { getApps, initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import env from "../../src/config/env.js";
import type { IngredientDocument } from "../../src/domain/types.js";
import { generateEmbedding } from "../../src/utils/embedding.js";

type RawIngredient = {
  ingredient_id: string;
  name: string;
  category: string;
};

type RawRecipe = {
  recipe_id: string;
  name: string;
  cuisine: string;
  course: string;
  prep_time_min: string;
  cook_time_min: string;
  servings: string;
  calories_est: string;
  instructions: string;
};

type RawRecipeIngredient = {
  recipe_id: string;
  ingredient_id: string;
  quantity: string;
  unit: string;
};

const DATA_DIR = path.resolve(
  process.cwd(),
  "../frontend/lumai/src/components/pages/calories/receipts"
);

const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  lb: 453.592,
  pound: 453.592,
  mg: 0.001,
  cup: 240,
  cups: 240,
  tbsp: 15,
  tablespoon: 15,
  tsp: 5,
  teaspoon: 5,
  ml: 1,
  liter: 1000,
  l: 1000,
  piece: 50,
  slices: 30,
  pinch: 0.5
};

const CATEGORY_NUTRITION = {
  meat: { calories: 165, protein: 31, carbs: 0, fats: 4, fiber: 0 },
  fish: { calories: 150, protein: 26, carbs: 0, fats: 6, fiber: 0 },
  dairy: { calories: 120, protein: 8, carbs: 12, fats: 4, fiber: 0 },
  grain: { calories: 340, protein: 13, carbs: 70, fats: 2, fiber: 10 },
  vegetable: { calories: 45, protein: 3, carbs: 9, fats: 0.5, fiber: 4 },
  fruit: { calories: 60, protein: 1, carbs: 15, fats: 0.2, fiber: 3 },
  legume: { calories: 120, protein: 9, carbs: 20, fats: 1, fiber: 8 },
  nuts: { calories: 600, protein: 20, carbs: 20, fats: 55, fiber: 8 },
  oils: { calories: 884, protein: 0, carbs: 0, fats: 100, fiber: 0 },
  sweetener: { calories: 400, protein: 0, carbs: 100, fats: 0, fiber: 0 },
  spice: { calories: 280, protein: 10, carbs: 50, fats: 14, fiber: 25 }
};

const CATEGORY_MICROS = {
  meat: { vitaminD: 1.1, vitaminB12: 2.4, iron: 1.2, magnesium: 25 },
  fish: { vitaminD: 8, vitaminB12: 4, iron: 0.5, magnesium: 30 },
  dairy: { vitaminD: 1, vitaminB12: 0.9, iron: 0.1, magnesium: 25 },
  grain: { vitaminD: 0, vitaminB12: 0, iron: 4, magnesium: 120 },
  vegetable: { vitaminD: 0, vitaminB12: 0, iron: 1.5, magnesium: 35 },
  fruit: { vitaminD: 0, vitaminB12: 0, iron: 0.4, magnesium: 20 },
  legume: { vitaminD: 0, vitaminB12: 0, iron: 3, magnesium: 60 },
  nuts: { vitaminD: 0, vitaminB12: 0, iron: 3.2, magnesium: 150 },
  oils: { vitaminD: 0, vitaminB12: 0, iron: 0, magnesium: 0 },
  sweetener: { vitaminD: 0, vitaminB12: 0, iron: 0, magnesium: 0 },
  spice: { vitaminD: 0.5, vitaminB12: 0, iron: 8, magnesium: 80 }
};

const ALLERGEN_MAP: Record<string, string[]> = {
  dairy: ["dairy"],
  nuts: ["nuts"],
  grain: ["gluten"],
  legume: ["soy"],
  seafood: ["shellfish", "fish"],
  fish: ["fish"]
};

const ANTIOXIDANT_PROFILE = ["low", "medium", "high"] as const;

const loadCsv = async <T>(fileName: string): Promise<T[]> => {
  const filePath = path.join(DATA_DIR, fileName);
  const file = await readFile(filePath, "utf-8");
  return parse(file, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as T[];
};

const convertToGrams = (quantity: number, unitRaw: string) => {
  const unit = unitRaw.toLowerCase();
  const multiplier = UNIT_TO_GRAMS[unit] ?? 1;
  return quantity * multiplier;
};

const resolveCategory = (category: string) => {
  const key = category?.toLowerCase?.() ?? "grain";
  if (CATEGORY_NUTRITION[key as keyof typeof CATEGORY_NUTRITION]) {
    return key as keyof typeof CATEGORY_NUTRITION;
  }
  if (key.includes("veg")) return "vegetable";
  if (key.includes("fruit")) return "fruit";
  if (key.includes("meat")) return "meat";
  if (key.includes("fish") || key.includes("salmon")) return "fish";
  if (key.includes("nut")) return "nuts";
  if (key.includes("oil")) return "oils";
  if (key.includes("dairy") || key.includes("milk")) return "dairy";
  if (key.includes("spice")) return "spice";
  if (key.includes("sweet")) return "sweetener";
  if (key.includes("grain") || key.includes("rice") || key.includes("wheat")) return "grain";
  return "vegetable";
};

const determineSustainability = (category: string) => {
  switch (category) {
    case "meat":
    case "dairy":
      return { carbonFootprint: "high", waterUsage: "high" };
    case "fish":
    case "grain":
      return { carbonFootprint: "medium", waterUsage: "medium" };
    default:
      return { carbonFootprint: "low", waterUsage: "low" };
  }
};

const determineDietaryTags = (recipe: RawRecipe, caloriesPerServing: number) => {
  const tags = new Set<string>();
  if (caloriesPerServing <= 450) tags.add("calorie-conscious");
  if (caloriesPerServing >= 650) tags.add("high-energy");
  if (recipe.course.includes("breakfast")) tags.add("breakfast");
  if (recipe.course.includes("snack")) tags.add("snack");
  if (recipe.course.includes("dinner")) tags.add("dinner");
  if (recipe.cuisine) tags.add(recipe.cuisine.toLowerCase());
  return Array.from(tags);
};

const buildSummary = (recipe: RawRecipe, ingredients: string[]) => {
  const topIngredients = ingredients.slice(0, 3).join(", ");
  return `${recipe.name} blends ${recipe.cuisine} flavors with ${topIngredients} for a satisfying ${recipe.course}.`;
};

const initializeFirebase = () => {
  if (!getApps().length) {
    initializeApp({
      credential: cert(env.serviceAccount as ServiceAccount),
      projectId: env.FIREBASE_PROJECT_ID
    });
  }
  return getFirestore();
};

const sustainabilityScoreToLabel = (value: number) => {
  if (value < 1.5) return "low";
  if (value < 2.5) return "medium";
  return "high";
};

const main = async () => {
  console.info("[nutrition-ingest] reading CSV files");
  const [ingredientsRaw, recipesRaw, recipeIngredientsRaw] = await Promise.all([
    loadCsv<RawIngredient>("ingredients.csv"),
    loadCsv<RawRecipe>("recipes.csv"),
    loadCsv<RawRecipeIngredient>("recipe_ingredients.csv")
  ]);

  const ingredientById = new Map<
    string,
    {
      id: string;
      name: string;
      category: string;
      nutrition: IngredientDocument["nutritionPer100g"];
      allergenTags: string[];
      sustainability: IngredientDocument["sustainability"];
    }
  >();

  const db = initializeFirebase();

  for (const ingredient of ingredientsRaw) {
    const category = resolveCategory(ingredient.category);
    const macro = CATEGORY_NUTRITION[category as keyof typeof CATEGORY_NUTRITION];
    const micro = CATEGORY_MICROS[category as keyof typeof CATEGORY_MICROS];
    const sustainability = determineSustainability(category);
    const profile = {
      calories: macro.calories,
      protein: macro.protein,
      carbs: macro.carbs,
      fats: macro.fats,
      fiber: macro.fiber ?? 2,
      vitaminD: micro.vitaminD,
      vitaminB12: micro.vitaminB12,
      iron: micro.iron,
      magnesium: micro.magnesium
    };

    ingredientById.set(ingredient.ingredient_id, {
      id: ingredient.ingredient_id,
      name: ingredient.name,
      category,
      nutrition: profile,
      allergenTags: ALLERGEN_MAP[category] ?? [],
      sustainability: {
        carbonFootprint: sustainability.carbonFootprint,
        waterUsage: sustainability.waterUsage,
        processingLevel: category === "oils" ? "processed" : "minimal"
      }
    });

    await db.collection("ingredients_master").doc(ingredient.ingredient_id).set(
      {
        id: ingredient.ingredient_id,
        name: ingredient.name,
        category,
        nutritionPer100g: profile,
        allergenTags: ALLERGEN_MAP[category] ?? [],
        sustainability: {
          carbonFootprint: sustainability.carbonFootprint,
          waterUsage: sustainability.waterUsage,
          processingLevel: category === "oils" ? "processed" : "minimal"
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      { merge: true }
    );
  }

  const recipeIngredientMap = recipeIngredientsRaw.reduce<Record<string, RawRecipeIngredient[]>>(
    (acc, entry) => {
      if (!acc[entry.recipe_id]) {
        acc[entry.recipe_id] = [];
      }
      acc[entry.recipe_id].push(entry);
      return acc;
    },
    {}
  );

  console.info("[nutrition-ingest] processing recipes");

  for (const recipe of recipesRaw) {
    const entries = recipeIngredientMap[recipe.recipe_id] ?? [];
    const normalizedIngredients = entries
      .map((entry) => {
        const ingredient = ingredientById.get(entry.ingredient_id);
        if (!ingredient) {
          return null;
        }
        const quantity = parseFloat(entry.quantity);
        const amount = Number.isFinite(quantity) ? quantity : 0;
        const grams = convertToGrams(amount, entry.unit);
        return {
          id: ingredient.id,
          name: ingredient.name,
          quantity: Number(grams.toFixed(2)),
          unit: "g",
          originalQuantity: amount,
          originalUnit: entry.unit,
          nutrition: ingredient.nutrition,
          allergenTags: ingredient.allergenTags,
          category: ingredient.category
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    if (!normalizedIngredients.length) {
      continue;
    }

    const totals = normalizedIngredients.reduce(
      (acc, item) => {
        const factor = item.quantity / 100;
        acc.calories += item.nutrition.calories * factor;
        acc.protein += item.nutrition.protein * factor;
        acc.carbs += item.nutrition.carbs * factor;
        acc.fats += item.nutrition.fats * factor;
        acc.fiber += item.nutrition.fiber * factor;
        acc.vitaminD += item.nutrition.vitaminD * factor;
        acc.vitaminB12 += item.nutrition.vitaminB12 * factor;
        acc.iron += item.nutrition.iron * factor;
        acc.magnesium += item.nutrition.magnesium * factor;
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

    const servings = Math.max(1, Number.parseInt(recipe.servings, 10) || 1);
    const macrosPerServing = {
      calories: Number((totals.calories / servings).toFixed(2)),
      protein: Number((totals.protein / servings).toFixed(2)),
      carbs: Number((totals.carbs / servings).toFixed(2)),
      fats: Number((totals.fats / servings).toFixed(2)),
      fiber: Number((totals.fiber / servings).toFixed(2))
    };

    const micronutrientsPerServing = {
      vitaminD: Number((totals.vitaminD / servings).toFixed(2)),
      vitaminB12: Number((totals.vitaminB12 / servings).toFixed(2)),
      iron: Number((totals.iron / servings).toFixed(2)),
      magnesium: Number((totals.magnesium / servings).toFixed(2))
    };

    const envAggregate = normalizedIngredients.reduce(
      (acc, item) => {
        const sustainability = determineSustainability(item.category);
        const scoreMap = { low: 1, medium: 2, high: 3 } as const;
        acc.carbon += scoreMap[sustainability.carbonFootprint as keyof typeof scoreMap];
        acc.water += scoreMap[sustainability.waterUsage as keyof typeof scoreMap];
        return acc;
      },
      { carbon: 0, water: 0 }
    );

    const glycemicIndex =
      normalizedIngredients.some((item) => item.nutrition.carbs > 40) ? 70 : 45;
    const satietyIndex = Math.min(
      100,
      Math.round((macrosPerServing.protein * 2 + macrosPerServing.fiber * 3) / 2)
    );
    const nutrientDensityScore = Number(
      (
        (macroWeight(macrosPerServing.protein) + macroWeight(macrosPerServing.fiber)) /
        2
      ).toFixed(1)
    );

    const antioxidantProfile = {
      polyphenols: ANTIOXIDANT_PROFILE[Math.floor(Math.random() * ANTIOXIDANT_PROFILE.length)],
      flavonoids: ANTIOXIDANT_PROFILE[Math.floor(Math.random() * ANTIOXIDANT_PROFILE.length)],
      carotenoids: ANTIOXIDANT_PROFILE[Math.floor(Math.random() * ANTIOXIDANT_PROFILE.length)]
    };

    const dietaryTags = determineDietaryTags(recipe, macrosPerServing.calories);
    const allergenTags = Array.from(
      new Set(
        normalizedIngredients.flatMap((ingredient) => ingredient.allergenTags ?? [])
      )
    );

    const summary = buildSummary(
      recipe,
      normalizedIngredients.map((item) => item.name)
    );

    const embeddingText = `${recipe.name} ${recipe.cuisine} ${recipe.course} ${summary} ${normalizedIngredients
      .map((ing) => ing.name)
      .join(", ")} ${recipe.instructions}`;

    const vector = await generateEmbedding(embeddingText);

    const recipeDoc = {
      id: recipe.recipe_id,
      title: recipe.name,
      cuisine: recipe.cuisine,
      meal: recipe.course,
      servings,
      prepTimeMin: Number(recipe.prep_time_min) || 0,
      cookTimeMin: Number(recipe.cook_time_min) || 0,
      instructions: recipe.instructions,
      summary,
      dietaryTags,
      allergenTags,
      ingredients: normalizedIngredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: "g",
        originalQuantity: ingredient.originalQuantity,
        originalUnit: ingredient.originalUnit
      })),
      macrosPerServing,
      micronutrientsPerServing,
      sustainability: {
        glycemicIndex,
        nutrientDensityScore,
        satietyIndex,
        antioxidantProfile,
        environmentalImpact: {
          carbonFootprint: sustainabilityScoreToLabel(envAggregate.carbon / normalizedIngredients.length),
          waterUsage: sustainabilityScoreToLabel(envAggregate.water / normalizedIngredients.length)
        }
      },
      ratingAverage: 0,
      ratingCount: 0,
      ratingSum: 0,
      embeddingId: recipe.recipe_id,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await db.collection("recipes_master").doc(recipe.recipe_id).set(recipeDoc);
    await db.collection("recipe_embeddings").doc(recipe.recipe_id).set({
      id: recipe.recipe_id,
      recipeId: recipe.recipe_id,
      vector,
      model: env.HF_EMBEDDING_MODEL ?? env.HF_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2",
      createdAt: Timestamp.now()
    });
  }

  console.info("[nutrition-ingest] completed");
};

const macroWeight = (value: number) => Math.min(10, value / 10);

void main().catch((error) => {
  console.error("[nutrition-ingest] failed", error);
  process.exitCode = 1;
});
