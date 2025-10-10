// profileOptions.ts
// Centralized profile-related option arrays for use in forms and validation

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export const FITNESS_GOALS = ['weight_loss', 'weight_gain', 'muscle_gain', 'general_fitness', 'endurance', 'flexibility'] as const;
export const GENDERS = ['male', 'female', 'non_binary', 'prefer_not_to_say'] as const;
export const OCCUPATIONS = ['desk', 'mixed', 'manual', 'shift', 'student', 'retired', 'unemployed'] as const;
export const DIET_PREFS = ['none', 'vegetarian', 'vegan', 'pescatarian', 'mediterranean', 'keto', 'paleo'] as const;
export const DIET_RESTR = ['none', 'gluten_free', 'dairy_free', 'nut_free', 'soy_free', 'egg_free', 'seafood_free'] as const;
export const EXERCISE_TYPES = ['cardio', 'strength', 'flexibility', 'sports', 'hiit'] as const;
export const FITNESS_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const ENVIRONMENTS = ['home', 'gym', 'outdoors', 'mixed'] as const;
export const SESSION_DURATIONS = ['15-30', '30-60', '60+'] as const;
export const DAY_TIMES = ['morning', 'afternoon', 'evening', 'flexible'] as const;
