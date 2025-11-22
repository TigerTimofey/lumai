import { Timestamp } from "firebase-admin/firestore";
import type { RecipeDocument } from "../domain/types.js";

const now = Timestamp.now();

const createIngredient = (
  id: string,
  name: string,
  quantity: number,
  unit: "g" | "ml" = "g",
  category: string = "pantry"
) => ({
  id,
  name,
  quantity,
  unit,
  originalUnit: unit,
  originalQuantity: quantity,
  category,
  nutrition: {
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
});

const makeRecipe = (
  id: string,
  title: string,
  meal: string,
  calories: number,
  protein: number,
  carbs: number,
  fats: number,
  ingredients: RecipeDocument["ingredients"],
  summary: string,
  steps: string[]
): RecipeDocument => ({
  id,
  title,
  cuisine: "Balanced",
  meal,
  servings: 1,
  prepTimeMin: 10,
  cookTimeMin: 15,
  instructions: steps.join(" "),
  summary,
  dietaryTags: ["balanced"],
  allergenTags: [],
  ingredients,
  preparation: steps.map((description, index) => ({
    step: `Step ${index + 1}`,
    description,
    ingredients: []
  })),
  macrosPerServing: {
    calories,
    protein,
    carbs,
    fats,
    fiber: 6
  },
  micronutrientsPerServing: {
    vitaminD: 2.5,
    vitaminB12: 2,
    iron: 3,
    magnesium: 80
  },
  sustainability: {
    glycemicIndex: 45,
    nutrientDensityScore: 8,
    satietyIndex: 70,
    antioxidantProfile: {
      polyphenols: "medium",
      flavonoids: "medium",
      carotenoids: "medium"
    },
    environmentalImpact: {
      carbonFootprint: "medium",
      waterUsage: "medium"
    }
  },
  ratingAverage: 4.2,
  ratingCount: 0,
  ratingSum: 0,
  createdAt: now,
  updatedAt: now
});

export const FALLBACK_RECIPES: RecipeDocument[] = [
  makeRecipe(
    "00000000-0000-4000-8000-000000000001",
    "Hearty Oatmeal Bowl",
    "breakfast",
    420,
    18,
    55,
    12,
    [
      createIngredient("fallback-ing-1", "Rolled oats", 80, "g", "pantry"),
      createIngredient("fallback-ing-2", "Greek yogurt", 100, "g", "dairy"),
      createIngredient("fallback-ing-3", "Blueberries", 60, "g", "produce"),
      createIngredient("fallback-ing-4", "Almond butter", 20, "g", "pantry"),
      createIngredient("fallback-ing-5", "Chia seeds", 10, "g", "pantry")
    ],
    "Creamy oats layered with yogurt, berries, and healthy fats for a satiating start.",
    [
      "Cook oats in water or milk until creamy.",
      "Stir in chia seeds and almond butter.",
      "Top with yogurt and fresh blueberries before serving."
    ]
  ),
  makeRecipe(
    "00000000-0000-4000-8000-000000000002",
    "Mediterranean Grain Bowl",
    "lunch",
    520,
    32,
    48,
    20,
    [
      createIngredient("fallback-ing-6", "Cooked quinoa", 150, "g", "pantry"),
      createIngredient("fallback-ing-7", "Baby spinach", 60, "g", "produce"),
      createIngredient("fallback-ing-8", "Cherry tomatoes", 80, "g", "produce"),
      createIngredient("fallback-ing-9", "Chickpeas", 100, "g", "proteins"),
      createIngredient("fallback-ing-10", "Olive oil", 15, "g", "pantry"),
      createIngredient("fallback-ing-11", "Feta cheese", 30, "g", "dairy")
    ],
    "Protein-packed quinoa bowl with greens, legumes, and a light dressing.",
    [
      "Combine quinoa, spinach, tomatoes, and chickpeas in a bowl.",
      "Drizzle with olive oil and season with salt and pepper.",
      "Top with crumbled feta before serving."
    ]
  ),
  makeRecipe(
    "00000000-0000-4000-8000-000000000003",
    "Lean Protein Plate",
    "dinner",
    610,
    40,
    35,
    24,
    [
      createIngredient("fallback-ing-12", "Grilled chicken breast", 150, "g", "proteins"),
      createIngredient("fallback-ing-13", "Roasted sweet potato", 180, "g", "produce"),
      createIngredient("fallback-ing-14", "Steamed broccoli", 100, "g", "produce"),
      createIngredient("fallback-ing-15", "Olive oil", 10, "g", "pantry")
    ],
    "Balanced dinner featuring grilled protein, complex carbs, and fiber-rich greens.",
    [
      "Season chicken and grill until cooked through.",
      "Roast sweet potato wedges with a drizzle of olive oil.",
      "Steam broccoli until tender-crisp and serve alongside."
    ]
  ),
  makeRecipe(
    "00000000-0000-4000-8000-000000000004",
    "Nut Butter Snack",
    "snack",
    280,
    12,
    18,
    16,
    [
      createIngredient("fallback-ing-16", "Whole grain rice cakes", 50, "g", "pantry"),
      createIngredient("fallback-ing-17", "Peanut butter", 30, "g", "pantry"),
      createIngredient("fallback-ing-18", "Sliced banana", 50, "g", "produce"),
      createIngredient("fallback-ing-19", "Ground flaxseed", 5, "g", "pantry")
    ],
    "Crunchy rice cakes topped with nut butter, banana, and flax for a quick energy boost.",
    [
      "Spread peanut butter evenly over rice cakes.",
      "Layer banana slices on top.",
      "Finish with a sprinkle of ground flaxseed."
    ]
  )
];
