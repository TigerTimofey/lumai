const CATEGORY_KEYS = [
  "produce",
  "proteins",
  "pantry",
  "dairy",
  "frozen",
  "beverages",
  "other"
] as const;
export type ShoppingCategory = (typeof CATEGORY_KEYS)[number];

const CATEGORY_HINTS: Record<ShoppingCategory, string[]> = {
  produce: ["vegetable", "green", "fruit", "berry", "lettuce", "spinach", "broccoli", "tomato", "potato", "carrot", "pepper"],
  proteins: ["protein", "meat", "chicken", "beef", "pork", "fish", "poultry", "seafood", "legume", "chickpea", "bean", "tofu", "lentil", "egg"],
  pantry: ["grain", "rice", "oat", "quinoa", "staple", "pantry", "oil", "spice", "nut", "seed", "butter", "flax", "chia", "cereal", "bread"],
  dairy: ["dairy", "cheese", "milk", "yogurt", "feta", "cream"],
  frozen: ["frozen"],
  beverages: ["snack", "drink", "juice", "coffee", "tea"],
  other: []
};

const matchCategory = (value: string) => {
  const normalized = value?.toLowerCase() ?? "";
  if (!normalized) return undefined;
  const direct = CATEGORY_KEYS.find((category) => category === normalized);
  if (direct) return direct;
  return CATEGORY_KEYS.find((category) =>
    CATEGORY_HINTS[category].some((hint) => normalized.includes(hint))
  );
};

export const resolveShoppingCategory = (categoryValue?: string, ingredientName?: string): ShoppingCategory => {
  return (
    matchCategory(categoryValue ?? "") ??
    matchCategory(ingredientName ?? "") ??
    "other"
  );
};
