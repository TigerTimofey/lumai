import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ingredientsPath = path.resolve(
  __dirname,
  "../frontend/lumai/src/components/pages/calories/receipts/ingredients.csv"
);
const recipesJsonPath = path.resolve(
  __dirname,
  "../frontend/lumai/src/components/pages/calories/receipts/recipes_with_ingredients.json"
);
const recipesJsonBackupPath = path.resolve(
  __dirname,
  "../frontend/lumai/src/components/pages/calories/receipts/recipes_with_ingredients.json.backup"
);

const placeholderRegex = /^(?:ingredient|vegetable|fruit|grain|spice|dairy|meat|fish|condiment|legume|other|protein|pantry)_\d+$/i;

const pools = {
  vegetable: [
    "Spinach",
    "Kale",
    "Broccoli",
    "Cauliflower",
    "Carrot",
    "Sweet Potato",
    "Zucchini",
    "Bell Pepper",
    "Eggplant",
    "Butternut Squash",
    "Green Beans",
    "Peas",
    "Asparagus",
    "Beetroot",
    "Brussels Sprouts",
    "Cabbage",
    "Cucumber",
    "Radish",
    "Leek",
    "Artichoke"
  ],
  fruit: [
    "Mango",
    "Pineapple",
    "Apple",
    "Pear",
    "Banana",
    "Cherry",
    "Peach",
    "Apricot",
    "Plum",
    "Kiwi",
    "Grapes",
    "Pomegranate",
    "Orange",
    "Lemon",
    "Lime",
    "Blueberry",
    "Raspberry",
    "Strawberry",
    "Blackberry",
    "Papaya"
  ],
  grain: [
    "Quinoa",
    "Brown Rice",
    "Wild Rice",
    "Barley",
    "Farro",
    "Bulgur",
    "Couscous",
    "Millet",
    "Buckwheat",
    "Oats",
    "Freekeh",
    "Sorghum",
    "Teff"
  ],
  spice: [
    "Cumin",
    "Turmeric",
    "Coriander",
    "Cardamom",
    "Fenugreek",
    "Paprika",
    "Saffron",
    "Sumac",
    "Tarragon",
    "Dill",
    "Thyme",
    "Rosemary",
    "Oregano",
    "Marjoram",
    "Sage"
  ],
  dairy: [
    "Greek Yogurt",
    "Goat Cheese",
    "Ricotta",
    "Mascarpone",
    "Parmesan",
    "Mozzarella",
    "Cheddar",
    "Feta",
    "Paneer",
    "Halloumi",
    "Cream Cheese",
    "Skyr",
    "Cottage Cheese",
    "Butter",
    "Ghee"
  ],
  meat: [
    "Chicken Thigh",
    "Ground Turkey",
    "Beef Sirloin",
    "Lamb Shoulder",
    "Pork Tenderloin",
    "Duck Breast",
    "Venison",
    "Bison",
    "Prosciutto",
    "Chorizo",
    "Pancetta",
    "Turkey Bacon"
  ],
  fish: [
    "Salmon",
    "Tuna",
    "Cod",
    "Halibut",
    "Mackerel",
    "Sardine",
    "Trout",
    "Sea Bass",
    "Tilapia",
    "Swordfish",
    "Anchovy",
    "Snapper"
  ],
  legume: [
    "Chickpeas",
    "Kidney Beans",
    "Black Beans",
    "Cannellini Beans",
    "Lentils",
    "Navy Beans",
    "Pinto Beans",
    "Butter Beans",
    "Fava Beans",
    "Edamame"
  ],
  condiment: [
    "Harissa",
    "Tahini",
    "Salsa Verde",
    "Chimichurri",
    "Pesto",
    "Aioli",
    "Tapenade",
    "Soy Sauce",
    "Fish Sauce",
    "Miso Paste",
    "Hoisin",
    "Gochujang"
  ],
  other: [
    "Maple Syrup",
    "Honey",
    "Molasses",
    "Dark Chocolate",
    "Toasted Coconut",
    "Pumpkin Seeds",
    "Sunflower Seeds",
    "Pine Nuts",
    "Walnuts",
    "Almonds",
    "Hazelnuts",
    "Pecans",
    "Macadamia Nuts"
  ],
  pantry: [
    "Olive Oil",
    "Avocado Oil",
    "Sesame Oil",
    "Peanut Oil",
    "Coconut Oil",
    "Apple Cider Vinegar",
    "Rice Vinegar",
    "Red Wine Vinegar",
    "Balsamic Vinegar"
  ]
};

const defaultPool = [
  "Herbal Blend",
  "Umami Paste",
  "Citrus Zest",
  "Toasted Spice Mix",
  "Seasoned Oil",
  "Mixed Seeds",
  "Nutty Crunch",
  "Savory Glaze",
  "Sweet Chili Drizzle",
  "Aromatic Rub"
];

const generateName = (category, id) => {
  const pool = pools[category] ?? defaultPool;
  const numericId = Number(id);
  const index = Number.isFinite(numericId) ? numericId : Math.floor(Math.random() * 1000);
  const base = pool[Math.abs(index) % pool.length];
  const suffix = Math.floor(Math.abs(index) / pool.length);
  return suffix ? `${base} ${suffix + 1}` : base;
};

const csvRaw = fs.readFileSync(ingredientsPath, "utf-8").trim().split("\n");
const header = csvRaw.shift();

const updatedRows = [];
const nameMap = new Map();

for (const line of csvRaw) {
  if (!line.trim()) continue;
  const [id, name, category] = line.split(",");
  if (!id || !name) continue;
  let newName = name;
  if (placeholderRegex.test(name)) {
    newName = generateName(category, id);
  }
  nameMap.set(String(id), newName);
  updatedRows.push([id, newName, category].join(","));
}

fs.writeFileSync(ingredientsPath, [header, ...updatedRows].join("\n") + "\n", "utf-8");

const recipes = JSON.parse(fs.readFileSync(recipesJsonPath, "utf-8"));

recipes.forEach((recipe) => {
  recipe.ingredients = recipe.ingredients.map((ingredient) => {
    const mapped = nameMap.get(String(ingredient.ingredient_id));
    if (mapped) {
      return {
        ...ingredient,
        name: mapped
      };
    }
    if (placeholderRegex.test(ingredient.name)) {
      return {
        ...ingredient,
        name: generateName(ingredient.category, ingredient.ingredient_id)
      };
    }
    return ingredient;
  });
});

const recipesJsonContent = JSON.stringify(recipes, null, 2) + "\n";
fs.writeFileSync(recipesJsonPath, recipesJsonContent, "utf-8");
if (fs.existsSync(recipesJsonBackupPath)) {
  fs.writeFileSync(recipesJsonBackupPath, recipesJsonContent, "utf-8");
}

console.log("Updated ingredient names in CSV, JSON, and backup (if present).");
