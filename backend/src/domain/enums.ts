export const GENDERS = [
  "male",
  "female",
  "non_binary",
  "prefer_not_to_say"
] as const;

export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active"
] as const;

export const OCCUPATION_TYPES = [
  "desk",
  "mixed",
  "manual",
  "shift",
  "student",
  "retired",
  "unemployed"
] as const;

export const DIETARY_PREFERENCES = [
  "none",
  "vegetarian",
  "vegan",
  "pescatarian",
  "mediterranean",
  "keto",
  "paleo",
  "low_carb",
  "low_fodmap",
  "whole30",
  "dash",
  "plant_based",
  "raw",
  "diabetic_friendly",
  "ayurvedic",
  "gluten_aware",
  "flexitarian"
] as const;

export const DIETARY_RESTRICTIONS = [
  "none",
  "gluten_free",
  "dairy_free",
  "nut_free",
  "soy_free",
  "egg_free",
  "seafood_free",
  "shellfish_free",
  "sesame_free",
  "corn_free",
  "sulfite_free",
  "citrus_free"
] as const;

export const FITNESS_GOALS = [
  "weight_loss",
  "weight_gain",
  "muscle_gain",
  "general_fitness",
  "endurance",
  "flexibility"
] as const;

export const EXERCISE_TYPES = ["cardio", "strength", "flexibility", "sports", "hiit"] as const;

export const SESSION_DURATIONS = ["15-30", "30-60", "60+"] as const;

export const FITNESS_LEVELS = ["beginner", "intermediate", "advanced"] as const;

export const EXERCISE_ENVIRONMENTS = ["home", "gym", "outdoors", "mixed"] as const;

export const DAY_TIMES = ["morning", "afternoon", "evening", "flexible"] as const;

export const PRIVACY_VISIBILITY = ["private", "connections", "public"] as const;

export const CONSENT_TYPES = ["data_processing", "ai_insights", "marketing"] as const;
