import { z } from "zod";
import {
  ACTIVITY_LEVELS,
  CONSENT_TYPES,
  DAY_TIMES,
  DIETARY_PREFERENCES,
  DIETARY_RESTRICTIONS,
  EXERCISE_ENVIRONMENTS,
  EXERCISE_TYPES,
  FITNESS_GOALS,
  FITNESS_LEVELS,
  GENDERS,
  OCCUPATION_TYPES,
  PRIVACY_VISIBILITY,
  SESSION_DURATIONS
} from "./enums.js";

const numericString = z.string().regex(/^\d+(\.\d+)?$/, "Invalid numeric format");

const weightSchema = z
  .union([
    z.object({
      unit: z.literal("kg"),
      value: z.union([z.number(), numericString])
    }),
    z.object({
      unit: z.literal("lb"),
      value: z.union([z.number(), numericString])
    })
  ])
  .transform((input) => {
    const numericValue = typeof input.value === "string" ? Number(input.value) : input.value;
    const weightKg = input.unit === "kg" ? numericValue : numericValue * 0.45359237;
    return Number(weightKg.toFixed(2));
  });

const heightSchema = z
  .union([
    z.object({
      unit: z.literal("cm"),
      value: z.union([z.number(), numericString])
    }),
    z.object({
      unit: z.literal("m"),
      value: z.union([z.number(), numericString])
    }),
    z.object({
      unit: z.literal("ft_in"),
      feet: z.union([z.number(), numericString]),
      inches: z.union([z.number(), numericString])
    })
  ])
  .transform((input) => {
    if (input.unit === "cm") {
      const value = typeof input.value === "string" ? Number(input.value) : input.value;
      return Number(value.toFixed(2));
    }

    if (input.unit === "m") {
      const value = typeof input.value === "string" ? Number(input.value) : input.value;
      return Number((value * 100).toFixed(2));
    }

    const feet = typeof input.feet === "string" ? Number(input.feet) : input.feet;
    const inches = typeof input.inches === "string" ? Number(input.inches) : input.inches;
    const totalInches = feet * 12 + inches;
    return Number((totalInches * 2.54).toFixed(2));
  });

export const demographicsSchema = z.object({
  age: z.union([z.number(), numericString]).transform((value) => Number(value)).pipe(
    z.number().int().min(13).max(120)
  ),
  gender: z.enum(GENDERS)
});

export const physicalMetricsSchema = z.object({
  height: heightSchema,
  weight: weightSchema,
  bmi: z.number().nonnegative().optional()
});

export const lifestyleSchema = z.object({
  occupationType: z.enum(OCCUPATION_TYPES),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  dietaryPreferences: z.array(z.enum(DIETARY_PREFERENCES)).default([]),
  dietaryRestrictions: z.array(z.enum(DIETARY_RESTRICTIONS)).default([])
});

export const goalsSchema = z.object({
  primaryGoal: z.enum(FITNESS_GOALS),
  targetWeightKg: z
    .union([z.number(), numericString])
    .transform((value) => Number(value))
    .optional(),
  targetActivityLevel: z.enum(ACTIVITY_LEVELS).optional(),
  notes: z.string().max(500).optional()
});

export const assessmentSchema = z.object({
  weeklyActivityFrequency: z
    .union([z.number(), numericString])
    .transform((value) => Number(value))
    .pipe(z.number().int().min(0).max(7)),
  exerciseTypes: z.array(z.enum(EXERCISE_TYPES)).default([]),
  averageSessionDuration: z.enum(SESSION_DURATIONS),
  fitnessLevel: z.enum(FITNESS_LEVELS),
  preferredExerciseEnvironment: z.enum(EXERCISE_ENVIRONMENTS),
  preferredTimeOfDay: z.enum(DAY_TIMES),
  enduranceLevelMinutes: z
    .union([z.number(), numericString])
    .transform((value) => Number(value))
    .pipe(z.number().min(0).max(240)),
  strengthIndicators: z
    .object({
      pushUps: z
        .union([z.number(), numericString])
        .transform((value) => Number(value))
        .pipe(z.number().int().min(0))
        .optional(),
      squats: z
        .union([z.number(), numericString])
        .transform((value) => Number(value))
        .pipe(z.number().int().min(0))
        .optional(),
      plankSeconds: z
        .union([z.number(), numericString])
        .transform((value) => Number(value))
        .pipe(z.number().int().min(0))
        .optional()
    })
    .partial()
    .optional()
});

export const healthHabitsSchema = z
  .object({
    sleepHours: z
      .union([z.number(), numericString])
      .transform((value) => Number(value))
      .pipe(z.number().min(0).max(24))
      .optional(),
    waterIntakeLiters: z
      .union([z.number(), numericString])
      .transform((value) => Number(value))
      .pipe(z.number().min(0).max(10))
      .optional(),
    stressLevel: z.enum(["low", "moderate", "high"]).optional(),
    smokingStatus: z.enum(["never", "former", "current"]).optional()
  })
  .partial()
  .default({});

export const privacyPreferencesSchema = z.object({
  profileVisibility: z.enum(PRIVACY_VISIBILITY).default("private"),
  shareWithResearch: z.boolean().default(false),
  shareWithCoaches: z.boolean().default(false),
  emailNotifications: z.object({
    insights: z.boolean().default(true),
    reminders: z.boolean().default(true),
    marketing: z.boolean().default(false)
  })
});

export const consentSchema = z.object({
  consentType: z.enum(CONSENT_TYPES),
  status: z.enum(["granted", "denied", "pending"]),
  updatedAt: z.date().optional()
});

export const healthProfileSchema = z.object({
  demographics: demographicsSchema,
  physicalMetrics: physicalMetricsSchema,
  lifestyle: lifestyleSchema,
  goals: goalsSchema,
  assessment: assessmentSchema,
  habits: healthHabitsSchema,
  privacy: privacyPreferencesSchema
});

export type HealthProfileInput = z.input<typeof healthProfileSchema>;
export type HealthProfile = z.output<typeof healthProfileSchema> & {
  normalized: {
    heightCm: number;
    weightKg: number;
    bmi: number;
  };
};

export const normalizeHealthProfile = (payload: HealthProfileInput) => {
  const parsed = healthProfileSchema.parse(payload);

  const heightCm = parsed.physicalMetrics.height;
  const weightKg = parsed.physicalMetrics.weight;
  const bmi = Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(2));

  const normalizedProfile: HealthProfile = {
    ...parsed,
    normalized: {
      heightCm,
      weightKg,
      bmi
    }
  };

  return normalizedProfile;
};
