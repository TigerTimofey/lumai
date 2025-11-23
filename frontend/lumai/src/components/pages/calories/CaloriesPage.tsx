import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement
} from 'chart.js';
import { Radar, Line, Bar, Doughnut } from 'react-chartjs-2';
import SideNav from '../../navigation/SideNav';
import UserSettingBar from '../dashboard/user-settings/userSettingBar';
import './CaloriesPage.css';
import recipesData from './receipts/recipes_with_ingredients.json';
import { apiFetch } from '../../../utils/api';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement
);

type RecipeFromJson = {
  recipe_id: number | string;
  name: string;
  cuisine: string;
  course: string;
  servings: number;
  ingredients: Array<{
    ingredient_id: number | string;
    name: string;
  }>;
};

const typedRecipes = recipesData as RecipeFromJson[];

const SHOPPING_CATEGORIES = [
  { key: 'produce', label: 'Fresh produce', hints: ['produce', 'vegetable', 'fruit', 'greens'], icon: '🥬' },
  { key: 'proteins', label: 'Proteins & legumes', hints: ['protein', 'meat', 'legume', 'beans', 'seafood'], icon: '🥩' },
  { key: 'pantry', label: 'Grains & pantry', hints: ['pantry', 'grain', 'baking', 'staple', 'carb'], icon: '🧺' },
  { key: 'dairy', label: 'Dairy & eggs', hints: ['dairy', 'egg', 'cheese', 'milk'], icon: '🥛' },
  { key: 'frozen', label: 'Frozen & convenience', hints: ['frozen', 'convenience'], icon: '🧊' },
  { key: 'beverages', label: 'Beverages & snacks', hints: ['drink', 'beverage', 'snack', 'condiment'], icon: '🥤' },
  { key: 'other', label: 'Extras & misc', hints: [], icon: '🛒' }
] as const;

type ShoppingCategoryKey = (typeof SHOPPING_CATEGORIES)[number]['key'];

const SHOPPING_CATEGORY_KEYS = SHOPPING_CATEGORIES.map((category) => category.key);

const resolveShoppingCategory = (raw: string): ShoppingCategoryKey => {
  const normalized = raw?.toLowerCase() ?? '';
  const match = SHOPPING_CATEGORIES.find((schema) =>
    schema.hints.some((hint) => normalized.includes(hint))
  );
  if (match) return match.key;
  return SHOPPING_CATEGORY_KEYS.includes(normalized as ShoppingCategoryKey) ? (normalized as ShoppingCategoryKey) : 'other';
};

type NutritionPreferences = {
  timezone: string;
  dietaryPreferences: string[];
  allergies: string[];
  dislikedIngredients: string[];
  cuisinePreferences: string[];
  calorieTarget: number;
  macronutrientTargets: {
    protein: number;
    carbs: number;
    fats: number;
  };
  micronutrientTargets?: Record<string, number>;
  mealsPerDay: number;
  preferredMealTimes: Record<string, string>;
};

type PreferencesUpdatePayload = Partial<Omit<NutritionPreferences, 'dietaryPreferences' | 'allergies' | 'dislikedIngredients'>> & {
  dietaryPreferences?: string[];
  allergies?: string[];
  dislikedIngredients?: string[];
  cuisinePreferences?: string[];
  preferredMealTimes?: Record<string, string>;
};

const MEAL_TIME_FIELDS = ['breakfast', 'lunch', 'dinner'] as const;
type MealTimeField = (typeof MEAL_TIME_FIELDS)[number];

const isoToTimeInput = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const timeInputToIso = (time: string) => {
  if (!time) return undefined;
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return undefined;
  }
  const base = new Date();
  base.setHours(hours, minutes, 0, 0);
  return base.toISOString();
};

const buildMealTimeState = (prefs?: NutritionPreferences | null) =>
  MEAL_TIME_FIELDS.reduce(
    (acc, key) => {
      acc[key] = isoToTimeInput(prefs?.preferredMealTimes?.[key]);
      return acc;
    },
    {} as Record<MealTimeField, string>
  );

type NutritionSnapshot = {
  date: string;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber?: number;
    vitaminD?: number;
    vitaminB12?: number;
    iron?: number;
    magnesium?: number;
  };
  goalComparison: {
    calorieDelta: number;
    proteinDelta: number;
    carbsDelta: number;
    fatsDelta: number;
  };
  wellnessImpactScore: number;
  consumedMeals?: Array<{
    planId: string;
    mealId: string;
    title?: string;
    type: string;
    loggedAt?: string | { seconds: number; nanoseconds: number };
    macros: {
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
    };
    micronutrients?: {
      vitaminD?: number;
      vitaminB12?: number;
      iron?: number;
      magnesium?: number;
      fiber?: number;
    };
  }>;
};

type MicronutrientSummary = {
  date?: string;
  totals: Record<string, number> | null;
  targets: Record<string, number>;
  coverage: Record<string, number> | null;
  deficits: string[];
  recommendations: string[];
  recipeIdeas: string[];
};

type MealPlanAnalysis = {
  highlights?: string[];
  risks?: string[];
  suggestions?: string[];
};

type MealPlan = {
  id: string;
  duration: 'daily' | 'weekly';
  startDate: string;
  endDate: string;
  timezone: string;
  strategySummary: string;
  analysis?: MealPlanAnalysis;
  nutritionalBalanceScore: number;
  diversityIndex: number;
  micronutrientCoverage: {
    percentage: number;
    deficiencies: string[];
    excess: string[];
  };
  weeklyTrends: {
    proteinConsistency: string;
    fiberTrend: string;
    sugarTrend: string;
  };
  sustainabilityMetrics: {
    plantToAnimalRatio: number;
    seasonalIngredientPercentage: number;
  };
  days: {
    date: string;
    meals: MealPlanMeal[];
  }[];
};

type MealPlanMeal = {
  id: string;
  type: string;
  title?: string;
  recipeId?: string;
  servings: number;
  scheduledAt: string;
  macros: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
  micronutrients?: Record<string, number>;
};

type ShoppingList = {
  id: string;
  mealPlanId: string;
  items: Array<{
    id: string;
    ingredientId: string;
    name: string;
    quantity: number;
    unit: string;
    category: string;
    checked: boolean;
  }>;
};

type RecipeDetail = {
  id: string;
  title: string;
  cuisine: string;
  summary: string;
  dietaryTags?: string[];
  ingredients: Array<{ id: string; name: string; quantity: number; unit: string; originalUnit?: string; originalQuantity?: number }>;
  preparation: Array<{ step: string; description: string; ingredients: string[] }>;
  instructions: string;
  servings: number;
  macrosPerServing: { calories: number; protein: number; carbs: number; fats: number; fiber?: number };
  ratingAverage?: number;
  ratingCount?: number;
};

type RecipeReview = {
  id: string;
  userId?: string;
  rating: number;
  comment?: string;
  createdAt?: { seconds: number; nanoseconds: number };
};

type ManualMealForm = {
  title: string;
  type: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

const createManualMealForm = (): ManualMealForm => ({
  title: '',
  type: 'snack',
  calories: 200,
  protein: 10,
  carbs: 20,
  fats: 8
});

const CaloriesPage: React.FC<{ user: User }> = ({ user }) => {
  const displayName = user.displayName ?? user.email ?? 'friend';
  const [preferences, setPreferences] = useState<NutritionPreferences | null>(null);
  const [snapshot, setSnapshot] = useState<NutritionSnapshot | null>(null);
  const [snapshots, setSnapshots] = useState<NutritionSnapshot[]>([]);
  const [analysis, setAnalysis] = useState<MealPlanAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [shoppingLoading, setShoppingLoading] = useState(false);
  const [recipeModal, setRecipeModal] = useState<{ open: boolean; recipe: RecipeDetail | null; servings: number; reviews: RecipeReview[] }>({
    open: false,
    recipe: null,
    servings: 1,
    reviews: []
  });
  const [reviewForm, setReviewForm] = useState<{ rating: number; comment: string }>({ rating: 5, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [swapSource, setSwapSource] = useState<string>('');
  const [swapTarget, setSwapTarget] = useState<string>('');
  const [manualMeals, setManualMeals] = useState<Record<string, ManualMealForm>>({});
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [pendingMealLog, setPendingMealLog] = useState<{ key: string; action: 'log' | 'unlog' } | null>(null);
  const [micronutrientSummary, setMicronutrientSummary] = useState<MicronutrientSummary | null>(null);
  const [micronutrientFocus, setMicronutrientFocus] = useState<string>('');
  const [planDuration, setPlanDuration] = useState<'daily' | 'weekly'>('weekly');

  const selectedPlan = mealPlans.find((plan) => plan.id === selectedPlanId) ?? null;

  const stats = useMemo(() => {
    const ingredients = new Set<string>();
    typedRecipes.forEach((recipe) => {
      recipe.ingredients.forEach((ingredient) => {
        if (ingredient?.name) {
          ingredients.add(ingredient.name);
        }
      });
    });
    return {
      recipes: typedRecipes.length,
      ingredients: ingredients.size
    };
  }, []);

  const latestSnapshot = snapshot ?? snapshots[0] ?? null;

  const totalMealsScheduled = useMemo(
    () =>
      mealPlans.reduce(
        (sum, plan) => sum + plan.days.reduce((count, day) => count + day.meals.length, 0),
        0
      ),
    [mealPlans]
  );

  const microCoverage = useMemo(() => {
    if (!preferences || !latestSnapshot) return null;
    const keys: Array<keyof NutritionSnapshot['totals']> = ['vitaminD', 'vitaminB12', 'iron', 'magnesium'];
    const achieved = keys.filter((key) => {
      const target = preferences.micronutrientTargets?.[key] ?? 0;
      if (!target) return false;
      return (latestSnapshot.totals[key] ?? 0) >= target * 0.8;
    }).length;
    return { achieved, total: keys.length };
  }, [preferences, latestSnapshot]);

  const planShoppingLists = useMemo(() => {
    if (!selectedPlanId) return [];
    return shoppingLists.filter((list) => list.mealPlanId === selectedPlanId);
  }, [shoppingLists, selectedPlanId]);

  const featureHighlights = useMemo(() => {
    const latestPlan = mealPlans[0];
    const planRange = latestPlan
      ? `${formatDate(latestPlan.startDate, latestPlan.timezone)} – ${formatDate(latestPlan.endDate, latestPlan.timezone)}`
      : null;
    const recipeSummary = `${stats.recipes.toLocaleString()} curated recipes using ${stats.ingredients.toLocaleString()} unique ingredients`;
    const shoppingSummary =
      planShoppingLists.length > 0
        ? `${planShoppingLists.length} shopping list${planShoppingLists.length > 1 ? 's' : ''} for this plan`
        : 'Generate a list from your current plan to organize your groceries.';
    const deficitLabel = micronutrientSummary?.deficits?.length
      ? `Shortfall: ${micronutrientSummary.deficits.map((item) => formatMicronutrientLabel(item)).join(', ')}`
      : null;
    const microSummary = deficitLabel
      ? deficitLabel
      : microCoverage
      ? `${microCoverage.achieved} of ${microCoverage.total} micronutrient targets met this week`
      : 'Track vitamins & minerals alongside your macros.';
    return [
      {
        title: 'AI meal plans',
        description: latestPlan
          ? `${mealPlans.length} plans scheduled (${planRange}), covering ${totalMealsScheduled} meals.`
          : 'Generate a weekly plan tailored to your goals, dietary rules, and timezone.'
      },
      {
        title: 'RAG-powered recipes',
        description: recipeSummary
      },
      {
        title: 'Shopping lists',
        description: shoppingSummary
      },
      {
        title: 'Micronutrient tracking',
        description: microSummary
      }
    ];
  }, [mealPlans, stats, planShoppingLists.length, microCoverage, totalMealsScheduled, micronutrientSummary]);

  useEffect(() => {
    if (!selectedPlanId) {
      setSelectedListId(null);
      return;
    }
    if (!planShoppingLists.length) {
      setSelectedListId(null);
      return;
    }
    setSelectedListId((prev) =>
      prev && planShoppingLists.some((list) => list.id === prev) ? prev : planShoppingLists[0]?.id ?? null
    );
  }, [selectedPlanId, planShoppingLists]);

  const planLabel = useMemo(() => {
    if (!selectedPlan) return null;
    const start = formatDate(selectedPlan.startDate, selectedPlan.timezone);
    const end = formatDate(selectedPlan.endDate, selectedPlan.timezone);
    const prefix = selectedPlan.duration === 'weekly' ? 'Weekly plan' : 'Daily plan';
    return start === end ? `${prefix} • ${start}` : `${prefix} • ${start} – ${end}`;
  }, [selectedPlan]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [prefs, snapshotResponse, planResponse, listResponse, micronutrientResp] = await Promise.all([
          apiFetch<NutritionPreferences>('/nutrition/preferences'),
          apiFetch<{ snapshots: NutritionSnapshot[] }>('/nutrition/snapshots?limit=7'),
          apiFetch<{ plans: MealPlan[] }>('/nutrition/meal-plans?limit=3'),
          apiFetch<{ lists: ShoppingList[] }>('/nutrition/shopping-lists?limit=3'),
          apiFetch<MicronutrientSummary>('/nutrition/micronutrients/summary')
        ]);
        if (!active) return;
        setPreferences(prefs);
        setSnapshot(snapshotResponse.snapshots?.[0] ?? null);
        setSnapshots(snapshotResponse.snapshots ?? []);
        setAnalysis(planResponse.plans?.[0]?.analysis ?? null);
        setMealPlans(planResponse.plans ?? []);
        setSelectedPlanId(planResponse.plans?.[0]?.id ?? null);
        setShoppingLists(listResponse.lists ?? []);
        setSelectedListId(listResponse.lists?.[0]?.id ?? null);
        setMicronutrientSummary(micronutrientResp);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPlan) {
      setExpandedDays({});
      return;
    }
    const defaults: Record<string, boolean> = {};
    selectedPlan.days.forEach((day, index) => {
      defaults[day.date] = index === 0;
    });
    setExpandedDays(defaults);
  }, [selectedPlanId, selectedPlan]);

  const handleGoToNutrition = () => {
    window.history.pushState({}, '', '/nutrition');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const calorieProgress = useMemo(() => {
    if (!preferences || !latestSnapshot) return 0;
    return Math.min(120, Math.round((latestSnapshot.totals.calories / preferences.calorieTarget) * 100));
  }, [preferences, latestSnapshot]);

  const macroProgress = useMemo(() => {
    if (!preferences || !latestSnapshot) return null;
    return [
      {
        label: 'Protein',
        value: latestSnapshot.totals.protein,
        target: preferences.macronutrientTargets.protein,
        unit: 'g'
      },
      {
        label: 'Carbs',
        value: latestSnapshot.totals.carbs,
        target: preferences.macronutrientTargets.carbs,
        unit: 'g'
      },
      {
        label: 'Fats',
        value: latestSnapshot.totals.fats,
        target: preferences.macronutrientTargets.fats,
        unit: 'g'
      }
    ];
  }, [preferences, latestSnapshot]);

  const micronutrientChart = useMemo(() => {
    if (!preferences || !latestSnapshot) return null;
    const labels = ['Vitamin D', 'Vitamin B12', 'Iron', 'Magnesium'];
    const keyMap: Record<string, keyof NutritionSnapshot['totals']> = {
      'Vitamin D': 'vitaminD',
      'Vitamin B12': 'vitaminB12',
      Iron: 'iron',
      Magnesium: 'magnesium'
    };
    const targetDefaults: Record<string, number> = {
      'Vitamin D': 20,
      'Vitamin B12': 2.4,
      Iron: 18,
      Magnesium: 420
    };
    const totals = labels.map((label) => latestSnapshot.totals[keyMap[label]] ?? 0);
    const targets = labels.map((label) => preferences.micronutrientTargets?.[keyMap[label]] ?? targetDefaults[label]);
    return {
      labels,
      totals,
      targets
    };
  }, [preferences, latestSnapshot]);

  const highlightCards = useMemo(() => {
    if (!preferences || !latestSnapshot) return [];
    return [
      {
        title: 'Wellness impact',
        value: `${Math.round(latestSnapshot.wellnessImpactScore)} / 100`,
        detail: 'Composite score from daily intake'
      },
      {
        title: 'Calorie delta',
        value: `${latestSnapshot.goalComparison.calorieDelta > 0 ? '+' : ''}${Math.round(latestSnapshot.goalComparison.calorieDelta)} kcal`,
        detail: 'vs. your target'
      },
      {
        title: 'Macro focus',
        value: `${preferences.macronutrientTargets.protein}/${preferences.macronutrientTargets.carbs}/${preferences.macronutrientTargets.fats} g`,
        detail: 'Protein / Carbs / Fats targets'
      }
    ];
  }, [preferences, latestSnapshot]);

  const derivedPlanMetrics = useMemo(() => derivePlannerMetrics(selectedPlan, preferences), [selectedPlan, preferences]);

  const plannerMetricCards = useMemo(() => {
    if (!selectedPlan || !derivedPlanMetrics) return [];
    const balance = derivedPlanMetrics.nutritionalBalanceScore;
    const diversity = derivedPlanMetrics.diversityIndex;
    const coverage = derivedPlanMetrics.micronutrientCoverage.percentage;
    const plantRatio = derivedPlanMetrics.sustainabilityMetrics.plantToAnimalRatio;
    const seasonal = derivedPlanMetrics.sustainabilityMetrics.seasonalIngredientPercentage;
    return [
      {
        title: 'Balance score',
        value: `${balance}/100`,
        detail: 'Macro + calorie alignment'
      },
      {
        title: 'Meal diversity',
        value: `${diversity}%`,
        detail: 'Unique meals in this plan'
      },
      {
        title: 'Micronutrient coverage',
        value: `${coverage}%`,
        detail: 'Average coverage vs. targets'
      },
      {
        title: 'Plant ratio',
        value: `${plantRatio}:1`,
        detail: 'Plant-to-animal servings'
      },
      {
        title: 'Seasonal picks',
        value: `${seasonal}%`,
        detail: 'Meals featuring seasonal produce'
      }
    ];
  }, [selectedPlan, derivedPlanMetrics]);

  const macroPieChart = useMemo(() => {
    if (!latestSnapshot) return null;
    const { protein, carbs, fats } = latestSnapshot.totals;
    const total = protein + carbs + fats;
    if (total === 0) {
      return null;
    }
    return {
      labels: ['Protein', 'Carbs', 'Fats'],
      data: [protein, carbs, fats]
    };
  }, [latestSnapshot]);

  const aiAdvice = useMemo(() => {
    const base =
      analysis?.suggestions?.length
        ? [...analysis.suggestions]
        : [
            'Keep logging meals to refine calorie insights.',
            'Plan hydration checkpoints alongside meals.',
            'Schedule a short reflection after dinner to adjust tomorrow’s plan.'
          ];
    if (micronutrientSummary?.recommendations?.length) {
      micronutrientSummary.recommendations.forEach((rec) => {
        if (!base.includes(rec)) {
          base.push(rec);
        }
      });
    }
    return base;
  }, [analysis, micronutrientSummary]);

  const riskAdvice = useMemo(() => {
    const base = analysis?.risks ? [...analysis.risks] : [];
    if (!latestSnapshot || !preferences) return base;
    const calorieDelta = latestSnapshot.goalComparison.calorieDelta;
    if (calorieDelta > 200) {
      base.push(`Calories exceeded target by ${Math.round(calorieDelta)} kcal. Consider a lighter dinner.`);
    } else if (calorieDelta < -200) {
      base.push(`You were ${Math.abs(Math.round(calorieDelta))} kcal below target. Add a balanced snack.`);
    }
    (['protein', 'carbs', 'fats'] as const).forEach((macro) => {
      const actual = latestSnapshot.totals[macro];
      const target = preferences.macronutrientTargets[macro];
      if (target && actual < target * 0.8) {
        base.push(`Low ${macro}: ${Math.round(actual)}g vs ${target}g target.`);
      }
    });
    if (micronutrientSummary?.deficits?.length) {
      base.push(
        `Micronutrient shortfall: ${micronutrientSummary.deficits
          .map((deficit) => formatMicronutrientLabel(deficit))
          .join(', ')}.`
      );
    }
    return base;
  }, [analysis, latestSnapshot, preferences, micronutrientSummary]);

  const flattenedMeals = useMemo(() => {
    if (!selectedPlan) return [];
    return selectedPlan.days.flatMap((day) =>
      day.meals.map((meal) => ({
        id: meal.id,
        label: `${formatDate(day.date, selectedPlan.timezone)} – ${meal.type}`,
        value: { day: day.date, mealId: meal.id }
      }))
    );
  }, [selectedPlan]);

  const fetchMealPlans = useCallback(async () => {
    const response = await apiFetch<{ plans: MealPlan[] }>('/nutrition/meal-plans?limit=3');
    setMealPlans(response.plans ?? []);
    setSelectedPlanId((prev) => prev ?? response.plans?.[0]?.id ?? null);
    setAnalysis(response.plans?.[0]?.analysis ?? null);
  }, []);

  const fetchShoppingListsData = useCallback(async () => {
    const response = await apiFetch<{ lists: ShoppingList[] }>('/nutrition/shopping-lists?limit=3');
    setShoppingLists(response.lists ?? []);
    setSelectedListId((prev) => prev ?? response.lists?.[0]?.id ?? null);
  }, []);

  const fetchRecipeReviews = useCallback(async (recipeId: string) => {
    const response = await apiFetch<{ reviews: RecipeReview[] }>(
      `/nutrition/recipes/${recipeId}/reviews?status=approved`
    );
    return response.reviews ?? [];
  }, []);

  const handleSavePreferences = async (payload: PreferencesUpdatePayload) => {
    const updated = await apiFetch<NutritionPreferences>('/nutrition/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    setPreferences(updated);
  };

  const handleGeneratePlan = async () => {
    setPlannerLoading(true);
    try {
      await apiFetch('/nutrition/meal-plans', {
        method: 'POST',
        body: JSON.stringify({ duration: planDuration, startDate: new Date().toISOString().slice(0, 10) })
      });
      await fetchMealPlans();
    } finally {
      setPlannerLoading(false);
    }
  };

  const handleRegeneratePlan = async (planId: string) => {
    setPlannerLoading(true);
    try {
      await apiFetch(`/nutrition/meal-plans/${planId}/regenerate`, { method: 'POST' });
      await fetchMealPlans();
    } finally {
      setPlannerLoading(false);
    }
  };

  const handleRegenerateMeal = async (planId: string, date: string, mealId: string) => {
    setPlannerLoading(true);
    try {
      await apiFetch(`/nutrition/meal-plans/${planId}/days/${date}/meals/${mealId}/regenerate`, {
        method: 'POST',
        body: JSON.stringify({
          micronutrientFocus: micronutrientFocus || undefined
        })
      });
      await fetchMealPlans();
    } finally {
      setPlannerLoading(false);
    }
  };

  const handleSwapMeals = async (planId: string) => {
    if (!swapSource || !swapTarget) return;
    const [sourceDay, sourceMeal] = swapSource.split('|');
    const [targetDay, targetMeal] = swapTarget.split('|');
    setPlannerLoading(true);
    try {
      await apiFetch(`/nutrition/meal-plans/${planId}/days/${sourceDay}/meals/${sourceMeal}/swap`, {
        method: 'POST',
        body: JSON.stringify({ targetDate: targetDay, targetMealId: targetMeal })
      });
      await fetchMealPlans();
      setSwapSource('');
      setSwapTarget('');
    } finally {
      setPlannerLoading(false);
    }
  };

  const getManualMealForDate = useCallback(
    (date: string) => manualMeals[date] ?? createManualMealForm(),
    [manualMeals]
  );

  const updateManualMeal = useCallback((date: string, field: keyof ManualMealForm, value: string | number) => {
    setManualMeals((prev) => {
      const current = prev[date] ?? createManualMealForm();
      const updated: ManualMealForm = { ...current };
      if (field === 'title' || field === 'type') {
        updated[field] = String(value);
      } else {
        updated[field] = Number(value);
      }
      return {
        ...prev,
        [date]: updated
      };
    });
  }, []);

  const resetManualMeal = useCallback((date: string) => {
    setManualMeals((prev) => {
      if (!prev[date]) return prev;
      const next = { ...prev };
      delete next[date];
      return next;
    });
  }, []);

  const loggedMealKeys = useMemo(() => {
    const keys = new Set<string>();
    const register = (entries?: NutritionSnapshot['consumedMeals']) => {
      entries?.forEach((entry) => {
        keys.add(`${entry.planId}|${entry.mealId}`);
      });
    };
    register(snapshot?.consumedMeals);
    snapshots.forEach((snap) => register(snap.consumedMeals));
    return keys;
  }, [snapshot, snapshots]);

  const handleManualMealAdd = async (planId: string, date: string, manualData?: ManualMealForm) => {
    const mealData = manualData ?? getManualMealForDate(date);
    setPlannerLoading(true);
    try {
      await apiFetch(`/nutrition/meal-plans/${planId}/days/${date}/meals`, {
        method: 'POST',
        body: JSON.stringify({
          title: mealData.title,
          type: mealData.type,
          scheduledAt: new Date().toISOString(),
          macros: {
            calories: mealData.calories,
            protein: mealData.protein,
            carbs: mealData.carbs,
            fats: mealData.fats
          }
        })
      });
      await fetchMealPlans();
      resetManualMeal(date);
    } finally {
      setPlannerLoading(false);
    }
  };

  const handleLoadRecipe = async (recipeId: string | undefined) => {
    if (!recipeId) return;
    const [recipe, reviews] = await Promise.all([
      apiFetch<RecipeDetail>(`/nutrition/recipes/${recipeId}`),
      fetchRecipeReviews(recipeId)
    ]);
    setRecipeModal({ open: true, recipe, servings: recipe.servings ?? 1, reviews });
    setReviewForm({ rating: 5, comment: '' });
  };

  const mergeSnapshotUpdate = useCallback((updatedSnapshot: NutritionSnapshot | null, targetDate: string) => {
    if (!targetDate) return;
    if (!updatedSnapshot) {
      setSnapshot((prev) => (prev?.date === targetDate ? null : prev));
      setSnapshots((prev) => prev.filter((item) => item.date !== targetDate));
      return;
    }
    setSnapshot((prev) => (prev?.date === updatedSnapshot.date || !prev ? updatedSnapshot : prev));
    setSnapshots((prev) => {
      const others = prev.filter((item) => item.date !== updatedSnapshot.date);
      const next = [updatedSnapshot, ...others];
      return next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
  }, []);

  const handleLogMeal = async (planId: string, date: string, mealId: string) => {
    const key = `${planId}|${mealId}`;
    if (loggedMealKeys.has(key)) return;
    setPendingMealLog({ key, action: 'log' });
    try {
      const updatedSnapshot = await apiFetch<NutritionSnapshot>(
        `/nutrition/meal-plans/${planId}/days/${date}/meals/${mealId}/log`,
        { method: 'POST' }
      );
      mergeSnapshotUpdate(updatedSnapshot, date);
    } finally {
      setPendingMealLog((current) => (current?.key === key ? null : current));
    }
  };

  const handleUnlogMeal = async (planId: string, date: string, mealId: string) => {
    const key = `${planId}|${mealId}`;
    if (!loggedMealKeys.has(key)) return;
    setPendingMealLog({ key, action: 'unlog' });
    try {
      const updatedSnapshot = await apiFetch<NutritionSnapshot | null>(
        `/nutrition/meal-plans/${planId}/days/${date}/meals/${mealId}/log`,
        { method: 'DELETE' }
      );
      mergeSnapshotUpdate(updatedSnapshot, date);
    } finally {
      setPendingMealLog((current) => (current?.key === key ? null : current));
    }
  };

  const closeRecipeModal = () => {
    setRecipeModal({ open: false, recipe: null, servings: 1, reviews: [] });
    setReviewForm({ rating: 5, comment: '' });
  };

  const handleReviewFormChange = (field: keyof typeof reviewForm, value: number | string) => {
    setReviewForm((prev) => ({
      ...prev,
      [field]: field === 'rating' ? Number(value) : String(value)
    }));
  };

  const handleSubmitReview = async () => {
    if (!recipeModal.recipe) return;
    setSubmittingReview(true);
    try {
      await apiFetch(`/nutrition/recipes/${recipeModal.recipe.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          rating: reviewForm.rating,
          comment: reviewForm.comment || undefined
        })
      });
      const updatedReviews = await fetchRecipeReviews(recipeModal.recipe.id);
      setRecipeModal((prev) =>
        prev.recipe
          ? {
              ...prev,
              reviews: updatedReviews
            }
          : prev
      );
      setReviewForm({ rating: 5, comment: '' });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleGenerateShoppingList = async () => {
    if (!selectedPlanId) return;
    setShoppingLoading(true);
    try {
      const list = await apiFetch<ShoppingList>('/nutrition/shopping-lists', {
        method: 'POST',
        body: JSON.stringify({ mealPlanId: selectedPlanId })
      });
      setShoppingLists((prev) => [list, ...prev]);
      setSelectedListId(list.id);
    } finally {
      setShoppingLoading(false);
    }
  };

  const handleUpdateListItem = async (listId: string, itemId: string, updates: Partial<{ quantity: number; checked: boolean }>) => {
    const updated = await apiFetch<ShoppingList>(`/nutrition/shopping-lists/${listId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    setShoppingLists((prev) => prev.map((list) => (list.id === updated.id ? updated : list)));
  };

  const handleRemoveListItem = async (listId: string, itemId: string) => {
    const updated = await apiFetch<ShoppingList>(`/nutrition/shopping-lists/${listId}/items/${itemId}`, {
      method: 'DELETE'
    });
    setShoppingLists((prev) => prev.map((list) => (list.id === updated.id ? updated : list)));
  };

  const historyChart = useMemo(() => {
    if (!preferences) return null;
    const snapshotsHistory = snapshots.length ? snapshots : snapshot ? [snapshot] : [];
    if (!snapshotsHistory.length) return null;
    const labels = snapshotsHistory.map((item) => formatDate(item.date, preferences.timezone));
    return {
      labels,
      planLine: {
        labels,
        datasets: [
          {
            label: 'Calories',
            data: snapshotsHistory.map((item) => item.totals.calories),
            borderColor: 'rgba(59, 130, 246, 1)',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            tension: 0.3
          },
          {
            label: 'Target',
            data: snapshotsHistory.map(() => preferences.calorieTarget),
            borderColor: 'rgba(15, 23, 42, 0.2)',
            borderDash: [6, 6]
          }
        ]
      }
    };
  }, [preferences, snapshot, snapshots]);

  return (
    <div className="dashboard-shell">
      <SideNav activeKey="nutrition" />
      <div className="dashboard-canvas">
        <main className="dashboard-main calories-main" role="main">
          <UserSettingBar name={displayName} photoURL={user.photoURL ?? null} />

          <section className="calories-hero">
            <div>
              <p className="calories-eyebrow">Nutrition companion</p>
              <h1 className="calories-title">Meal planning hub</h1>
              <p className="calories-subtitle">
                Explore our recipe knowledge base and prepare for AI-powered meal plans tailored to your health profile.
              </p>
              <button type="button" className="calories-cta" onClick={handleGoToNutrition}>
                Open nutrition workspace
              </button>
            </div>
            <div className="calories-stats">
              <article>
                <p className="calories-stat-label">Recipe library</p>
                <p className="calories-stat-value">{stats.recipes.toLocaleString()}</p>
                <p className="calories-stat-meta">Standardized with macros & micros</p>
              </article>
              <article>
                <p className="calories-stat-label">Unique ingredients</p>
                <p className="calories-stat-value">{stats.ingredients.toLocaleString()}</p>
                <p className="calories-stat-meta">Ready for shopping lists</p>
              </article>
            </div>
          </section>

          <section className="calories-features" aria-label="Nutrition features overview">
            {featureHighlights.map((card) => (
              <article key={card.title} className="calories-card">
                <h2>{card.title}</h2>
                <p>{card.description}</p>
              </article>
            ))}
          </section>

          <section className="calories-metrics">
            {loading ? (
              <p className="calories-loading">Loading your nutrition data…</p>
            ) : error ? (
              <p className="calories-error" role="alert">{error}</p>
            ) : (
              <>
                <div className="calories-progress">
                  <div>
                    <p className="calories-section-label">Daily calorie target</p>
                    <ProgressBar
                      label="Calories"
                      value={snapshot?.totals.calories ?? 0}
                      target={preferences?.calorieTarget ?? 0}
                      percentage={calorieProgress}
                      unit="kcal"
                    />
                  </div>
                  <div className="calories-macro-grid">
                    {macroProgress?.map((macro) => (
                      <ProgressBar
                        key={macro.label}
                        label={macro.label}
                        value={macro.value}
                        target={macro.target}
                        unit={macro.unit}
                        percentage={macro.target ? Math.min(120, Math.round((macro.value / macro.target) * 100)) : 0}
                        compact
                      />
                    ))}
                  </div>
                </div>

                <div className="calories-charts">
                  <div className="micronutrient-card">
                    <header>
                      <h3>Micronutrient radar</h3>
                      <p>Real intake vs. targets</p>
                    </header>
                    {micronutrientChart ? (
                      <Radar
                        data={{
                          labels: micronutrientChart.labels,
                          datasets: [
                            {
                              label: 'Intake',
                              data: micronutrientChart.totals,
                              backgroundColor: 'rgba(16, 185, 129, 0.2)',
                              borderColor: 'rgba(16, 185, 129, 1)',
                              borderWidth: 2
                            },
                            {
                              label: 'Target',
                              data: micronutrientChart.targets,
                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                              borderColor: 'rgba(59, 130, 246, 1)',
                              borderWidth: 1,
                              borderDash: [4, 4]
                            }
                          ]
                        }}
                        options={{
                          scales: {
                            r: {
                              angleLines: { color: 'rgba(15, 23, 42, 0.08)' },
                              grid: { color: 'rgba(15, 23, 42, 0.08)' },
                              suggestedMin: 0
                            }
                          },
                          plugins: {
                            legend: { position: 'bottom' }
                          }
                        }}
                      />
                    ) : (
                      <p className="calories-empty">No micronutrient data yet.</p>
                    )}
                  </div>
                  <div className="highlight-grid">
                    {highlightCards.map((card) => (
                      <article key={card.title} className="highlight-card">
                        <p className="highlight-title">{card.title}</p>
                        <p className="highlight-value">{card.value}</p>
                        <p className="highlight-detail">{card.detail}</p>
                      </article>
                    ))}
                  </div>
  
                </div>

                <div className="calories-ai-advice">
                  <article className="ai-advice-card">
                    <header>
                      <h3>AI suggestions</h3>
                      <p>Personalized nudges from your current plan</p>
                    </header>
                    <ul>
                      {aiAdvice.map((tip, index) => (
                        <li key={`${tip}-${index}`}>{tip}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="ai-advice-card secondary">
                    <header>
                      <h3>Watch-outs</h3>
                      <p>Potential risks detected</p>
                    </header>
                    {riskAdvice.length ? (
                      <ul>
                        {riskAdvice.map((risk, index) => (
                          <li key={`${risk}-${index}`}>{risk}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="calories-empty">No risks detected this week.</p>
                    )}
                  </article>
                </div>
              </>
            )}
          </section>

          <section className="calories-preferences">
            <PreferencesForm preferences={preferences} onSave={handleSavePreferences} />
            {preferences && needsPreferencePrompt(preferences) && (
              <div className="preferences-alert" role="status">
                <strong>Heads up:</strong> fill out dietary preferences, allergies, disliked ingredients, and meals-per-day to help AI craft better plans.
              </div>
            )}
                         {macroPieChart && (
                    <div className="macro-pie-card">
                      <header>
                        <h3>Macro breakdown</h3>
                        <p>Distribution for your latest log</p>
                      </header>
                      <Doughnut
                        data={{
                          labels: macroPieChart.labels,
                          datasets: [
                            {
                              data: macroPieChart.data,
                              backgroundColor: ['#0ea5e9', '#fbbf24', '#f97316'],
                              hoverOffset: 8
                            }
                          ]
                        }}
                        options={{
                          maintainAspectRatio: false,
                          responsive: true,
                          plugins: {
                            legend: { position: 'bottom' }
                          }
                        }}
                      />
                    </div>
                  )}
                   {micronutrientSummary?.coverage && (
                  <article className="micronutrient-summary-card">
                    <header>
                      <div>
                        <h3>Micronutrient focus</h3>
                        <p>Daily vitamin & mineral balance</p>
                      </div>
                      {micronutrientSummary.deficits.length ? (
                        <div className="micronutrient-deficits">
                          {micronutrientSummary.deficits.map((deficit) => (
                            <span key={deficit} className="micronutrient-chip">
                              Shortfall: {formatMicronutrientLabel(deficit)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="micronutrient-chip success">On target</span>
                      )}
                    </header>
                    <ul className="micronutrient-progress-list">
                      {['vitaminD', 'vitaminB12', 'iron', 'magnesium'].map((key) => {
                        const coverage = micronutrientSummary.coverage?.[key] ?? 0;
                        const percent = Math.min(140, Math.round(coverage * 100));
                        return (
                          <li key={key}>
                            <div className="micronutrient-progress-row">
                              <span>{formatMicronutrientLabel(key)}</span>
                              <span>{percent}%</span>
                            </div>
                            <div className="micronutrient-progress-bar">
                              <div style={{ width: `${Math.min(100, percent)}%` }} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={140} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {micronutrientSummary.recommendations.length > 0 && (
                      <ul className="micronutrient-recommendations">
                        {micronutrientSummary.recommendations.slice(0, 2).map((rec) => (
                          <li key={rec}>{rec}</li>
                        ))}
                      </ul>
                    )}
                    {micronutrientSummary.recipeIdeas.length > 0 && (
                      <p className="micronutrient-ideas">
                        Try this: {micronutrientSummary.recipeIdeas.join(', ')}
                      </p>
                    )}
                  </article>
                )}

          </section>

          <section className="calories-planner">
            <header className="section-header">
              <div>
                <p className="calories-section-label">Meal planner</p>
                <h2>Create and manage meal plans</h2>
              </div>
              <div className="planner-actions">
   
                <button
                  type="button"
                  className="dashboard-hero-action"
                  onClick={handleGeneratePlan}
                  disabled={plannerLoading}
                >
                  {planDuration === 'weekly' ? 'Generate weekly plan' : 'Generate daily plan'}
                </button>
                {selectedPlanId && (
                  <button
                    type="button"
                    className="dashboard-hero-action"
                    onClick={() => handleRegeneratePlan(selectedPlanId)}
                    disabled={plannerLoading}
                  >
                    Regenerate selected plan
                  </button>
                )}             <div className="planner-duration">
                  <label htmlFor="planDuration">Plan length</label>
                  <select
                    id="planDuration"
                    value={planDuration}
                    onChange={(e) => setPlanDuration(e.target.value as 'daily' | 'weekly')}
                  >
                    <option value="daily">1 day</option>
                    <option value="weekly">7 days</option>
                  </select>
                </div>
              </div>
            </header>
            <PlannerControls
              mealPlans={mealPlans}
              selectedPlanId={selectedPlanId}
              onSelectPlan={setSelectedPlanId}
              swapSource={swapSource}
              swapTarget={swapTarget}
              onSwapSourceChange={setSwapSource}
              onSwapTargetChange={setSwapTarget}
              onSwap={() => selectedPlanId && handleSwapMeals(selectedPlanId)}
              flattenedMeals={flattenedMeals}
              plannerLoading={plannerLoading}
              micronutrientFocus={micronutrientFocus}
              onMicronutrientFocusChange={setMicronutrientFocus}
            />
            <MealCalendar
              plan={selectedPlan}
              timezone={selectedPlan?.timezone ?? preferences?.timezone ?? 'UTC'}
              onRegenerateMeal={(date, mealId) => selectedPlanId && handleRegenerateMeal(selectedPlanId, date, mealId)}
              onManualMealAdd={(date, manual) => selectedPlanId && handleManualMealAdd(selectedPlanId, date, manual)}
              manualMeals={manualMeals}
              onManualMealChange={updateManualMeal}
              onViewRecipe={(recipeId) => handleLoadRecipe(recipeId)}
              onLogMeal={(date, mealId) => selectedPlanId && handleLogMeal(selectedPlanId, date, mealId)}
              onUnlogMeal={(date, mealId) => selectedPlanId && handleUnlogMeal(selectedPlanId, date, mealId)}
              loggedMeals={loggedMealKeys}
              pendingMealLog={pendingMealLog}
              expandedDays={expandedDays}
              onToggleDay={(day) =>
                setExpandedDays((prev) => ({ ...prev, [day]: !prev[day] }))
              }
            />
            {selectedPlan?.analysis && (
              <div className="planner-analysis">
                <article>
                  <h3>Highlights</h3>
                  <ul>{selectedPlan.analysis.highlights?.map((item) => <li key={item}>{item}</li>) ?? <li>No highlights recorded.</li>}</ul>
                </article>
                <article>
                  <h3>Risks</h3>
                  <ul>{selectedPlan.analysis.risks?.map((item) => <li key={item}>{item}</li>) ?? <li>None detected.</li>}</ul>
                </article>
                <article>
                  <h3>Suggestions</h3>
                  <ul>{selectedPlan.analysis.suggestions?.map((item) => <li key={item}>{item}</li>) ?? <li>No suggestions yet.</li>}</ul>
                </article>
              </div>
            )}
            {selectedPlan && derivedPlanMetrics && (
              <div className="planner-metrics">
                {plannerMetricCards.map((card) => (
                  <article key={card.title} className="highlight-card">
                    <p className="highlight-title">{card.title}</p>
                    <p className="highlight-value">{card.value}</p>
                    <p className="highlight-detail">{card.detail}</p>
                  </article>
                ))}
                <div className="planner-metrics-notes">
                  {derivedPlanMetrics.weeklyTrends && (
                    <p>
                      Protein consistency is <strong>{derivedPlanMetrics.weeklyTrends.proteinConsistency}</strong>,
                      fiber trend is <strong>{derivedPlanMetrics.weeklyTrends.fiberTrend}</strong>, and sugar trend is{' '}
                      <strong>{derivedPlanMetrics.weeklyTrends.sugarTrend}</strong>.
                    </p>
                  )}
                  {derivedPlanMetrics.micronutrientCoverage.deficiencies.length ? (
                    <p>
                      Micronutrient gaps:{' '}
                      {derivedPlanMetrics.micronutrientCoverage.deficiencies
                        .map((item) => formatMicronutrientLabel(item))
                        .join(', ')}
                    </p>
                  ) : (
                    <p>
                      Micronutrient coverage averages{' '}
                      <strong>{derivedPlanMetrics.micronutrientCoverage.percentage}%</strong> of your targets.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="calories-shopping">
            <header className="section-header">
              <div>
                <p className="calories-section-label">Shopping lists</p>
                <h2>Plan groceries by meal plan</h2>
              </div>
            <button type="button" className="dashboard-hero-action" onClick={handleGenerateShoppingList} disabled={!selectedPlanId || shoppingLoading}>
              Generate from plan
            </button>
            </header>
            <ShoppingListPanel
              shoppingLists={planShoppingLists}
              selectedListId={selectedListId}
              planLabel={planLabel}
              onRefresh={fetchShoppingListsData}
              onQuantityChange={handleUpdateListItem}
              onRemoveItem={handleRemoveListItem}
            />
                         <section className="calories-history">
            <header className="section-header">
              <div>
                <p className="calories-section-label">Historical insights</p>
                <h2>Track deficit/surplus over time</h2>
              </div>
            </header>
            {historyChart ? (
              <div className="history-grid">
                <div className="history-card">
                  <h3>Calorie trend</h3>
                  <Line data={historyChart.planLine} />
                </div>
                <div className="history-card">
                  <h3>Macro totals</h3>
                  <Bar
                    data={{
                        labels: ['Protein', 'Carbs', 'Fats'],
                        datasets: [
                          {
                            label: 'Actual',
                            data: [
                            latestSnapshot?.totals.protein ?? 0,
                            latestSnapshot?.totals.carbs ?? 0,
                            latestSnapshot?.totals.fats ?? 0
                          ],
                          backgroundColor: 'rgba(59, 130, 246, 0.6)'
                        },
                        {
                          label: 'Target',
                          data: [
                            preferences?.macronutrientTargets.protein ?? 0,
                            preferences?.macronutrientTargets.carbs ?? 0,
                            preferences?.macronutrientTargets.fats ?? 0
                          ],
                          backgroundColor: 'rgba(203, 213, 225, 0.7)'
                        }
                      ]
                    }}
                    options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }}
                  />
                </div>
              </div>
            ) : (
              <p className="calories-empty">No historical snapshots yet.</p>
            )}
          </section>
          </section>

      
        </main>
      </div>
      {recipeModal.open && recipeModal.recipe && (
        <RecipeModal
          recipe={recipeModal.recipe}
          servings={recipeModal.servings}
          reviews={recipeModal.reviews}
          reviewForm={reviewForm}
          submittingReview={submittingReview}
          onClose={closeRecipeModal}
          onServingsChange={(servings) => setRecipeModal((prev) => ({ ...prev, servings }))}
          onReviewChange={handleReviewFormChange}
          onSubmitReview={handleSubmitReview}
        />
      )}
    </div>
  );
};

interface ProgressProps {
  label: string;
  value: number;
  target: number;
  percentage: number;
  unit?: string;
  compact?: boolean;
}

const ProgressBar: React.FC<ProgressProps> = ({ label, value, target, percentage, unit, compact }) => {
  return (
    <div className={`progress-card ${compact ? 'progress-card-compact' : ''}`}>
      <div className="progress-card-header">
        <span>{label}</span>
        <span>{Math.round(value)}{unit ? ` ${unit}` : ''} / {Math.round(target)}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="progress-bar-track" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value}>
        <div className="progress-bar-fill" style={{ width: `${Math.min(120, percentage)}%` }} />
      </div>
    </div>
  );
};

interface PreferencesFormProps {
  preferences: NutritionPreferences | null;
  onSave: (payload: PreferencesUpdatePayload) => Promise<void>;
}

const PreferencesForm: React.FC<PreferencesFormProps> = ({ preferences, onSave }) => {
  const [form, setForm] = useState(() => ({
    timezone: preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    dietaryPreferences: preferences?.dietaryPreferences.join(', ') ?? '',
    allergies: preferences?.allergies.join(', ') ?? '',
    dislikedIngredients: preferences?.dislikedIngredients.join(', ') ?? '',
    cuisinePreferences: preferences?.cuisinePreferences.join(', ') ?? '',
    mealsPerDay: preferences?.mealsPerDay ?? 3,
    mealTimes: buildMealTimeState(preferences)
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!preferences) return;
    setForm({
      timezone: preferences.timezone,
      dietaryPreferences: preferences.dietaryPreferences.join(', '),
      allergies: preferences.allergies.join(', '),
      dislikedIngredients: preferences.dislikedIngredients.join(', '),
      cuisinePreferences: preferences.cuisinePreferences.join(', '),
      mealsPerDay: preferences.mealsPerDay,
      mealTimes: buildMealTimeState(preferences)
    });
  }, [preferences]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parseList = (value: string) =>
        value
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean);
      await onSave({
        timezone: form.timezone,
        dietaryPreferences: parseList(form.dietaryPreferences),
        allergies: parseList(form.allergies),
        dislikedIngredients: parseList(form.dislikedIngredients),
        cuisinePreferences: parseList(form.cuisinePreferences),
        mealsPerDay: Number(form.mealsPerDay),
        preferredMealTimes: Object.entries(form.mealTimes).reduce<Record<string, string>>((acc, [key, value]) => {
          const iso = timeInputToIso(value);
          if (iso) {
            acc[key] = iso;
          }
          return acc;
        }, {})
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="preferences-form" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="timezone">Timezone</label>
        <input
          id="timezone"
          value={form.timezone}
          onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
        />
      </div>
      <div>
        <label htmlFor="dietaryPrefs">Dietary preferences</label>
        <input
          id="dietaryPrefs"
          value={form.dietaryPreferences}
          onChange={(e) => setForm((prev) => ({ ...prev, dietaryPreferences: e.target.value }))}
          placeholder="vegetarian, low-carb"
        />
      </div>
      <div>
        <label htmlFor="allergies">Allergies / intolerances</label>
        <input
          id="allergies"
          value={form.allergies}
          onChange={(e) => setForm((prev) => ({ ...prev, allergies: e.target.value }))}
          placeholder="nuts, gluten"
        />
      </div>
      <div>
        <label htmlFor="disliked">Disliked ingredients</label>
        <input
          id="disliked"
          value={form.dislikedIngredients}
          onChange={(e) => setForm((prev) => ({ ...prev, dislikedIngredients: e.target.value }))}
        />
      </div>
      <div>
        <label htmlFor="cuisine">Cuisine preferences</label>
        <input
          id="cuisine"
          value={form.cuisinePreferences}
          onChange={(e) => setForm((prev) => ({ ...prev, cuisinePreferences: e.target.value }))}
          placeholder="mediterranean, japanese"
        />
      </div>
      <div>
        <label htmlFor="mealsPerDay">Meals per day</label>
        <input
          id="mealsPerDay"
          type="number"
          min={2}
          max={6}
          value={form.mealsPerDay}
          onChange={(e) => setForm((prev) => ({ ...prev, mealsPerDay: Number(e.target.value) }))}
        />
      </div>
      <fieldset className="meal-times">
        <legend>Preferred meal times</legend>
        <p className="planner-hint">These times determine the default schedule for generated meals.</p>
        <div className="meal-times-grid">
          {MEAL_TIME_FIELDS.map((key) => (
            <div key={key}>
              <label htmlFor={`${key}Time`}>{key.charAt(0).toUpperCase() + key.slice(1)}</label>
              <input
                id={`${key}Time`}
                type="time"
                value={form.mealTimes[key]}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    mealTimes: { ...prev.mealTimes, [key]: e.target.value }
                  }))
                }
              />
            </div>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="dashboard-hero-action dashboard-hero-action--small" disabled={saving}>Save preferences</button>
    </form>
  );
};

interface PlannerControlsProps {
  mealPlans: MealPlan[];
  selectedPlanId: string | null;
  onSelectPlan: (id: string | null) => void;
  swapSource: string;
  swapTarget: string;
  onSwapSourceChange: (value: string) => void;
  onSwapTargetChange: (value: string) => void;
  onSwap: () => void;
  flattenedMeals: Array<{ id: string; label: string; value: { day: string; mealId: string } }>;
  plannerLoading: boolean;
  micronutrientFocus: string;
  onMicronutrientFocusChange: (value: string) => void;
}

const PlannerControls: React.FC<PlannerControlsProps> = ({
  mealPlans,
  selectedPlanId,
  onSelectPlan,
  swapSource,
  swapTarget,
  onSwapSourceChange,
  onSwapTargetChange,
  onSwap,
  flattenedMeals,
  plannerLoading,
  micronutrientFocus,
  onMicronutrientFocusChange
}) => {
  const planOptions = mealPlans.map((plan) => ({
    id: plan.id,
    label: `${plan.duration} plan (${formatDate(plan.startDate, plan.timezone)} - ${formatDate(plan.endDate, plan.timezone)})`
  }));

  return (
    <div className="planner-controls">
      <div>
        <label htmlFor="planSelect">Select plan</label>
        <select id="planSelect" value={selectedPlanId ?? ''} onChange={(e) => onSelectPlan(e.target.value || null)}>
          {planOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="swap-row">
        <div>
          <label>Swap source</label>
          <select value={swapSource} onChange={(e) => onSwapSourceChange(e.target.value)}>
            <option value="">Choose meal</option>
            {flattenedMeals.map((meal) => (
              <option key={meal.id} value={formatSwapValue(meal)}>{meal.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Swap target</label>
          <select value={swapTarget} onChange={(e) => onSwapTargetChange(e.target.value)}>
            <option value="">Choose target</option>
            {flattenedMeals.map((meal) => (
              <option key={meal.id} value={formatSwapValue(meal)}>{meal.label}</option>
            ))}
          </select>
        </div>
        <button type="button" className="dashboard-hero-action dashboard-hero-action--small" onClick={onSwap} disabled={!swapSource || !swapTarget || plannerLoading}>
          Swap
        </button>
      </div>
      <div>
        <label htmlFor="micronutrientFocus">Micronutrient focus</label>
        <select id="micronutrientFocus" value={micronutrientFocus} onChange={(e) => onMicronutrientFocusChange(e.target.value)}>
          <option value="">Any nutrient</option>
          <option value="vitaminD">Vitamin D</option>
          <option value="vitaminB12">Vitamin B12</option>
          <option value="iron">Iron</option>
          <option value="magnesium">Magnesium</option>
        </select>
        <p className="planner-hint">Regenerating meals will prioritize the selected nutrient gap.</p>
      </div>
    </div>
  );
};

const formatSwapValue = (meal: { value: { day: string; mealId: string } }) =>
  `${meal.value.day}|${meal.value.mealId}`;

interface MealCalendarProps {
  plan: MealPlan | null;
  timezone: string;
  onRegenerateMeal: (date: string, mealId: string) => void;
  onManualMealAdd: (date: string, manualMeal: ManualMealForm) => void;
  manualMeals: Record<string, ManualMealForm>;
  onManualMealChange: (date: string, field: keyof ManualMealForm, value: string | number) => void;
  onViewRecipe: (recipeId?: string) => void;
  onLogMeal: (date: string, mealId: string) => void;
  onUnlogMeal: (date: string, mealId: string) => void;
  loggedMeals: Set<string>;
  pendingMealLog: { key: string; action: 'log' | 'unlog' } | null;
  expandedDays: Record<string, boolean>;
  onToggleDay: (day: string) => void;
}

const MealCalendar: React.FC<MealCalendarProps> = ({
  plan,
  timezone,
  onRegenerateMeal,
  onManualMealAdd,
  manualMeals,
  onManualMealChange,
  onViewRecipe,
  onLogMeal,
  onUnlogMeal,
  loggedMeals,
  pendingMealLog,
  expandedDays,
  onToggleDay
}) => {
  if (!plan) {
    return <p className="calories-empty">No meal plan generated yet.</p>;
  }

  return (
    <div className="meal-calendar">
      {plan.days.map((day) => (
        <article key={day.date} className={`day-accordion ${expandedDays[day.date] ? 'is-open' : ''}`}>
          <header className="day-accordion-header">
            <div>
              <h3>{formatDate(day.date, timezone)}</h3>
              <p>{new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(day.date))}</p>
            </div>
            <div className="day-accordion-meta">
              <span>{Math.round(sumDayCalories(day))} kcal planned</span>
              <button
                type="button"
                className="day-accordion-toggle dashboard-hero-action dashboard-hero-action--ghost"
                aria-expanded={expandedDays[day.date] ?? false}
                onClick={() => onToggleDay(day.date)}
              >
                {expandedDays[day.date] ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </header>
          {expandedDays[day.date] && (
            <>
              <div className="meal-list">
                {day.meals.map((meal) => {
                  const mealKey = `${plan.id}|${meal.id}`;
                  const isLogged = loggedMeals.has(mealKey);
                  const pendingAction = pendingMealLog?.key === mealKey ? pendingMealLog.action : null;
                  const handleMealLogToggle = () =>
                    isLogged ? onUnlogMeal(day.date, meal.id) : onLogMeal(day.date, meal.id);
                  return (
                    <div key={meal.id} className={`meal-card ${isLogged ? 'is-logged' : ''}`}>
                      <div>
                        <p className="meal-type">{meal.type}</p>
                        <p className="meal-title">{meal.title ?? 'AI recipe'}</p>
                        <p className="meal-meta">
                          {Math.round(meal.macros.calories)} kcal · {Math.round(meal.macros.protein)}g protein
                        </p>
                        <p className="meal-time">{formatTime(meal.scheduledAt, timezone)}</p>
                      </div>
                      <div className="meal-actions">
                        <button
                          type="button"
                          className={`dashboard-hero-action dashboard-hero-action--small ${
                            isLogged ? 'is-success is-ghost' : ''
                          }`}
                          disabled={!!pendingAction}
                          onClick={handleMealLogToggle}
                        >
                          {isLogged
                            ? pendingAction === 'unlog'
                              ? 'Removing…'
                              : 'Unlog meal'
                            : pendingAction === 'log'
                              ? 'Logging…'
                              : 'Log meal'}
                        </button>
                        {meal.recipeId && (
                          <button type="button" className="dashboard-hero-action dashboard-hero-action--small" onClick={() => onViewRecipe(meal.recipeId)}>Recipe</button>
                        )}
                        <button type="button" className="dashboard-hero-action dashboard-hero-action--small" onClick={() => onRegenerateMeal(day.date, meal.id)}>Regenerate</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="manual-meal">
                <h4>Add manual meal</h4>
                {(() => {
                  const manualMeal = manualMeals[day.date] ?? createManualMealForm();
                  return (
                    <>
                      <input
                        value={manualMeal.title}
                        onChange={(e) => onManualMealChange(day.date, 'title', e.target.value)}
                        placeholder="Meal name"
                      />
                      <select value={manualMeal.type} onChange={(e) => onManualMealChange(day.date, 'type', e.target.value)}>
                        <option value="snack">Snack</option>
                        <option value="lunch">Lunch</option>
                        <option value="dinner">Dinner</option>
                        <option value="breakfast">Breakfast</option>
                      </select>
                      <div className="manual-grid">
                        {(['calories', 'protein', 'carbs', 'fats'] as const).map((field) => (
                          <label key={field}>
                            {field}
                            <input
                              type="number"
                              value={manualMeal[field]}
                              onChange={(e) => onManualMealChange(day.date, field, Number(e.target.value))}
                            />
                          </label>
                        ))}
                      </div>
                      <button type="button" className="dashboard-hero-action dashboard-hero-action--small" onClick={() => onManualMealAdd(day.date, manualMeal)}>Add meal</button>
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
};

interface ShoppingListPanelProps {
  shoppingLists: ShoppingList[];
  selectedListId: string | null;
  planLabel: string | null;
  onRefresh: () => void;
  onQuantityChange: (listId: string, itemId: string, updates: Partial<{ quantity: number; checked: boolean }>) => void;
  onRemoveItem: (listId: string, itemId: string) => void;
}

const ShoppingListPanel: React.FC<ShoppingListPanelProps> = ({
  shoppingLists,
  selectedListId,
  planLabel,
  onRefresh,
  onQuantityChange,
  onRemoveItem
}) => {
  const list = shoppingLists.find((entry) => entry.id === selectedListId) ?? shoppingLists[0] ?? null;
  const grouped = useMemo(() => {
    if (!list) return {} as Record<string, ShoppingList['items']>;
    return list.items.reduce<Record<string, ShoppingList['items']>>((acc, item) => {
      const key = resolveShoppingCategory(item.category);
      acc[key] = acc[key] ? [...acc[key], item] : [item];
      return acc;
    }, {});
  }, [list]);

  const orderedCategories = SHOPPING_CATEGORIES.map((schema) => ({
    ...schema,
    items: grouped[schema.key] ?? []
  }));

  const listMeta = useMemo(() => {
    if (!list) return null;
    const totalItems = list.items.length;
    const checkedItems = list.items.filter((item) => item.checked).length;
    const totalCategories = Object.values(grouped).filter((items) => items.length > 0).length;
    return { totalItems, checkedItems, totalCategories };
  }, [list, grouped]);



  return (
    <div className="shopping-panel">
      <div className="shopping-header">
        <div>
          <p className="shopping-plan-label">{planLabel ?? 'Select a meal plan to view its shopping list.'}</p>
          {list && shoppingLists.length > 1 && (
            <p className="shopping-list-details">
              Showing list {shoppingLists.findIndex((entry) => entry.id === list.id) + 1} of {shoppingLists.length}
            </p>
          )}
        </div>
        <button type="button" className="dashboard-hero-action dashboard-hero-action--small" onClick={onRefresh}>Refresh</button>
      </div>
      {!list && <p className="calories-empty">No shopping list generated for this plan yet.</p>}
      {list && (
        <>
          <div className="shopping-meta">
            <p><strong>{listMeta?.totalItems ?? 0}</strong> items</p>
            <p><strong>{listMeta?.checkedItems ?? 0}</strong> checked</p>
            <p><strong>{listMeta?.totalCategories ?? 0}</strong> categories</p>
          </div>
          <div className="shopping-categories">
            {orderedCategories.map((category) => (
              <article key={category.key} className="shopping-category">
                <header>
                  <span className="shopping-category-icon" aria-hidden>{category.icon}</span>
                  <div>
                    <h4>{category.label}</h4>
                    <p>{category.items.length ? `${category.items.length} ingredient${category.items.length === 1 ? '' : 's'}` : 'No items'}</p>
                  </div>
                </header>
                {category.items.length ? (
                  <ul>
                    {category.items.map((item) => {
                      const checkboxId = `shopping-${list.id}-${item.id}`;
                      return (
                        <li key={item.id} className="shopping-row">
                          <div className="shopping-item">
                            <input
                              id={checkboxId}
                              type="checkbox"
                              checked={item.checked}
                              onChange={(e) => onQuantityChange(list.id, item.id, { checked: e.target.checked })}
                            />
                            <label className="shopping-item-name" htmlFor={checkboxId}>
                              {item.name}
                            </label>
                          </div>
                          <div className="shopping-controls">
                            <div className="shopping-stepper">
      
                              <input
                                type="number"
                                value={Number(item.quantity.toFixed(0))}
                                onChange={(e) =>
                                  onQuantityChange(list.id, item.id, { quantity: Number(e.target.value) })
                                }
                              />
                    
                              <span className="shopping-unit">{item.unit}</span>
                            </div>
                            <button
                              type="button"
                              className="dashboard-hero-action--ghost shopping-remove"
                              onClick={() => onRemoveItem(list.id, item.id)}
                              aria-label={`Remove ${item.name} from list`}
                            >
                              ×
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="shopping-empty-category">Nothing needed here.</p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

interface RecipeModalProps {
  recipe: RecipeDetail;
  servings: number;
  reviews: RecipeReview[];
  reviewForm: { rating: number; comment: string };
  submittingReview: boolean;
  onServingsChange: (value: number) => void;
  onClose: () => void;
  onReviewChange: (field: keyof RecipeModalProps['reviewForm'], value: number | string) => void;
  onSubmitReview: () => void;
}

const RecipeModal: React.FC<RecipeModalProps> = ({
  recipe,
  servings,
  reviews,
  reviewForm,
  submittingReview,
  onServingsChange,
  onClose,
  onReviewChange,
  onSubmitReview
}) => {
  const scale = servings / (recipe.servings || 1);
  const scaledIngredients = recipe.ingredients.map((ingredient) => ({
    ...ingredient,
    quantity: Number((ingredient.quantity * scale).toFixed(1))
  }));
  const macros = recipe.macrosPerServing ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const tags = recipe.dietaryTags ?? [];

  return (
    <div className="recipe-modal-backdrop" role="dialog" aria-modal>
      <div className="recipe-modal">
        <header>
          <div>
            <h3>{recipe.title}</h3>
            <p>{recipe.summary}</p>
            <div className="recipe-meta">
              <span>{recipe.cuisine}</span>
              {tags.slice(0, 3).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
          <button type="button" className="recipe-modal-close dashboard-hero-action dashboard-hero-action--ghost" aria-label="Close recipe" onClick={onClose}>×</button>
        </header>
        <div className="recipe-macro-grid">
          <article>
            <p>Calories</p>
            <strong>{Math.round(macros.calories)} kcal</strong>
          </article>
          <article>
            <p>Protein</p>
            <strong>{Math.round(macros.protein)} g</strong>
          </article>
          <article>
            <p>Carbs</p>
            <strong>{Math.round(macros.carbs)} g</strong>
          </article>
          <article>
            <p>Fats</p>
            <strong>{Math.round(macros.fats)} g</strong>
          </article>
        </div>
        <div className="servings-row">
          <label>
            Servings
            <input type="number" min={1} value={servings} onChange={(e) => onServingsChange(Number(e.target.value))} />
          </label>
        </div>
        <div className="recipe-content">
          <section>
            <h4>Ingredients</h4>
            <ul>
              {scaledIngredients.map((ingredient) => (
                <li key={ingredient.id}>{ingredient.quantity} {ingredient.unit} {ingredient.name}</li>
              ))}
            </ul>
          </section>
          <section>
            <h4>Instructions</h4>
            <ol>
              {recipe.preparation?.length
                ? recipe.preparation.map((step) => <li key={step.step}>{step.description}</li>)
                : recipe.instructions.split('. ').map((sentence, index) => <li key={index}>{sentence}</li>)}
            </ol>
          </section>
          <section className="recipe-reviews">
            <h4>Community reviews</h4>
            {reviews.length ? (
              <ul>
                {reviews.slice(0, 3).map((review) => {
                  const timestamp = review.createdAt
                    ? new Date(review.createdAt.seconds * 1000)
                    : null;
                  return (
                    <li key={review.id}>
                      <strong>{'★'.repeat(review.rating)}</strong>
                      {review.comment && <span> — {review.comment}</span>}
                      {timestamp && (
                        <span className="review-date">
                          {' '}
                          ({timestamp.toLocaleDateString()})
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No reviews yet. Be the first to share feedback!</p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitReview();
              }}
            >
              <label>
                Rating
                <select
                  value={reviewForm.rating}
                  onChange={(e) => onReviewChange('rating', Number(e.target.value))}
                >
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value} ★
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Comment (optional)
                <textarea
                  value={reviewForm.comment}
                  onChange={(e) => onReviewChange('comment', e.target.value)}
                  placeholder="Share preparation tips or substitutions"
                />
              </label>
              <button type="submit" className="dashboard-hero-action dashboard-hero-action--small" disabled={submittingReview}>
                {submittingReview ? 'Sending...' : 'Share review'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

const formatDate = (date: string, timeZone: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone }).format(new Date(date));

const formatTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat(undefined, { timeStyle: 'short', timeZone }).format(new Date(iso));

const sumDayCalories = (day: MealPlan['days'][number]) =>
  day.meals.reduce((total, meal) => total + (meal.macros.calories ?? 0), 0);

const DEFAULT_MICRONUTRIENT_TARGETS: Record<string, number> = {
  vitaminD: 20,
  vitaminB12: 2.4,
  iron: 18,
  magnesium: 420
};

const DEFAULT_MACRO_TARGETS: NutritionPreferences['macronutrientTargets'] = {
  protein: 110,
  carbs: 220,
  fats: 70
};

type PlannerMetrics = {
  nutritionalBalanceScore: number;
  diversityIndex: number;
  micronutrientCoverage: {
    percentage: number;
    deficiencies: string[];
    excess: string[];
  };
  weeklyTrends: {
    proteinConsistency: string;
    fiberTrend: string;
    sugarTrend: string;
  };
  sustainabilityMetrics: {
    plantToAnimalRatio: number;
    seasonalIngredientPercentage: number;
  };
};

const aggregatePlanTotals = (plan: MealPlan) => {
  return plan.days.reduce(
    (acc, day) => {
      day.meals.forEach((meal) => {
        acc.calories += meal.macros.calories ?? 0;
        acc.protein += meal.macros.protein ?? 0;
        acc.carbs += meal.macros.carbs ?? 0;
        acc.fats += meal.macros.fats ?? 0;
        acc.fiber += meal.micronutrients?.fiber ?? 0;
        acc.vitaminD += meal.micronutrients?.vitaminD ?? 0;
        acc.vitaminB12 += meal.micronutrients?.vitaminB12 ?? 0;
        acc.iron += meal.micronutrients?.iron ?? 0;
        acc.magnesium += meal.micronutrients?.magnesium ?? 0;
      });
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
};

const derivePlannerMetrics = (plan: MealPlan | null, prefs: NutritionPreferences | null): PlannerMetrics | null => {
  if (!plan) return null;
  const totals = aggregatePlanTotals(plan);
  const meals = plan.days.flatMap((day) => day.meals);
  const dayCount = Math.max(plan.days.length, 1);

  const macroTargets = prefs?.macronutrientTargets ?? DEFAULT_MACRO_TARGETS;
  const calorieTarget = prefs?.calorieTarget ?? Math.max(totals.calories / dayCount || 0, 1800);

  const fallbackBalance = Math.max(
    0,
    Math.round(
      100 -
        Math.abs(totals.calories / dayCount - calorieTarget) / 5 -
        (Math.abs(totals.protein / dayCount - macroTargets.protein) +
          Math.abs(totals.carbs / dayCount - macroTargets.carbs) +
          Math.abs(totals.fats / dayCount - macroTargets.fats)) /
          3
    )
  );

  const uniqueMeals = new Set(meals.map((meal) => meal.recipeId ?? meal.title));
  const fallbackDiversity = meals.length ? Math.round(Math.min(1, uniqueMeals.size / meals.length) * 100) : 0;

  const microTargets = prefs?.micronutrientTargets ?? DEFAULT_MICRONUTRIENT_TARGETS;
  const microEntries = Object.entries(microTargets).map(([key, target]) => {
    const average = (totals as Record<string, number>)[key] ? (totals as Record<string, number>)[key] / dayCount : 0;
    const coverage = target ? average / target : 0;
    return { key, coverage };
  });
  const fallbackCoverage = {
    percentage: microEntries.length
      ? Math.round(Math.min(1.5, microEntries.reduce((sum, entry) => sum + entry.coverage, 0) / microEntries.length) * 100)
      : 0,
    deficiencies: microEntries.filter((entry) => entry.coverage < 0.8).map((entry) => entry.key),
    excess: microEntries.filter((entry) => entry.coverage > 1.25).map((entry) => entry.key)
  };

  const proteinRatio = macroTargets.protein
    ? (totals.protein / dayCount) / macroTargets.protein
    : 1;
  const fiberAverage = totals.fiber / dayCount;
  const sugarAverage = totals.carbs / dayCount;

  const fallbackTrends = {
    proteinConsistency: proteinRatio >= 0.95 ? 'high' : proteinRatio >= 0.75 ? 'moderate' : 'low',
    fiberTrend: fiberAverage >= 25 ? 'increasing' : fiberAverage >= 15 ? 'steady' : 'declining',
    sugarTrend: sugarAverage > macroTargets.carbs ? 'decreasing' : 'stable'
  };

  const plantKeywords = ['salad', 'bowl', 'tofu', 'lentil', 'bean', 'vegetable', 'veg', 'quinoa', 'plant'];
  const animalKeywords = ['chicken', 'beef', 'pork', 'turkey', 'fish', 'egg', 'cheese', 'yogurt', 'salmon'];
  const seasonalKeywords = ['seasonal', 'fresh', 'summer', 'spring', 'harvest'];

  const plantMeals = meals.filter((meal) => plantKeywords.some((keyword) => meal.title?.toLowerCase().includes(keyword))).length;
  const animalMeals = meals.filter((meal) => animalKeywords.some((keyword) => meal.title?.toLowerCase().includes(keyword))).length;
  const seasonalMeals = meals.filter((meal) => seasonalKeywords.some((keyword) => meal.title?.toLowerCase().includes(keyword))).length;

  const fallbackSustainability = {
    plantToAnimalRatio: Number.isFinite(plantMeals / Math.max(animalMeals, 1))
      ? Number((plantMeals / Math.max(animalMeals, 1)).toFixed(2))
      : 0,
    seasonalIngredientPercentage: meals.length ? Math.round((seasonalMeals / meals.length) * 100) : 0
  };

  return {
    nutritionalBalanceScore: plan.nutritionalBalanceScore ?? fallbackBalance,
    diversityIndex: plan.diversityIndex ?? fallbackDiversity,
    micronutrientCoverage: {
      percentage: plan.micronutrientCoverage?.percentage ?? fallbackCoverage.percentage,
      deficiencies: plan.micronutrientCoverage?.deficiencies?.length
        ? plan.micronutrientCoverage.deficiencies
        : fallbackCoverage.deficiencies,
      excess: plan.micronutrientCoverage?.excess?.length
        ? plan.micronutrientCoverage.excess
        : fallbackCoverage.excess
    },
    weeklyTrends: plan.weeklyTrends ?? fallbackTrends,
    sustainabilityMetrics: plan.sustainabilityMetrics ?? fallbackSustainability
  };
};

const needsPreferencePrompt = (prefs: NutritionPreferences | null) => {
  if (!prefs) return true;
  const missingDiet = prefs.dietaryPreferences.length === 0;
  const missingAllergies = prefs.allergies.length === 0;
  const missingDisliked = prefs.dislikedIngredients.length === 0;
  const mealsInvalid = !prefs.mealsPerDay || prefs.mealsPerDay < 2;
  return missingDiet || missingAllergies || missingDisliked || mealsInvalid;
};

const formatMicronutrientLabel = (key: string) => {
  const map: Record<string, string> = {
    vitaminD: 'Vitamin D',
    vitaminB12: 'Vitamin B12',
    iron: 'Iron',
    magnesium: 'Magnesium'
  };
  return map[key] ?? key;
};

export default CaloriesPage;
