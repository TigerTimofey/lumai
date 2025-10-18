import { createHash } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import type { HealthProfileVersionDocument, ProcessedMetricsDocument, UserDocument } from "../domain/types.js";
import { createProcessedMetrics } from "../repositories/processed-metrics.repo.js";
import { getUserById } from "../repositories/user.repo.js";

// Remove undefined/empty values from nested objects/arrays so AI payloads stay compact.
const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map(sanitize)
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .reduce<Record<string, unknown>>((acc, [key, v]) => {
        const sanitized = sanitize(v);
        if (sanitized !== undefined) {
          acc[key] = sanitized;
        }
        return acc;
      }, {});
  }

  if (value === undefined) {
    return undefined;
  }

  return value;
};

// Map a normalized profile version into the AI-friendly schema.
const buildUserMetrics = (profile: HealthProfileVersionDocument) => {
  const { demographics, physicalMetrics, lifestyle, goals, assessment, habits, normalized } = profile;

  return sanitize({
    current_state: {
      age: demographics.age,
      gender: demographics.gender,
      height_cm: normalized?.heightCm ?? physicalMetrics?.height,
      weight_kg: normalized?.weightKg ?? physicalMetrics?.weight,
      bmi: normalized?.bmi ?? physicalMetrics?.bmi,
      activity_level: lifestyle.activityLevel,
      weekly_activity_frequency: assessment.weeklyActivityFrequency,
      endurance_minutes: assessment.enduranceLevelMinutes,
      strength: assessment.strengthIndicators ?? null
    },
    target_state: {
      weight_kg: goals.targetWeightKg ?? null,
      activity_level: goals.targetActivityLevel ?? null
    },
    preferences: {
      lifestyle: lifestyle.activityLevel,
      dietary_preferences: lifestyle.dietaryPreferences,
      dietary_restrictions: lifestyle.dietaryRestrictions,
      exercise_environment: assessment.preferredExerciseEnvironment,
      exercise_time: assessment.preferredTimeOfDay,
      exercise_types: assessment.exerciseTypes,
      session_duration: assessment.averageSessionDuration
    },
    habits: {
      sleep_hours: habits.sleepHours ?? null,
      water_intake_liters: habits.waterIntakeLiters ?? null,
      stress_level: habits.stressLevel ?? null,
      smoking_status: habits.smokingStatus ?? null
    },
    goals: {
      primary: goals.primaryGoal,
      notes: goals.notes ?? null
    },
    metadata: {
      generated_at: Timestamp.now().toDate().toISOString()
    }
  });
};

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(numeric) ? Number(numeric) : null;
};

const buildUserMetricsFromUserDocument = (user: UserDocument) => {
  const required = (user.requiredProfile ?? {}) as Record<string, unknown>;
  const extra = (user.additionalProfile ?? {}) as Record<string, unknown>;
  const strength = (extra.strengthMetrics ?? {}) as Record<string, unknown>;

  return sanitize({
    current_state: {
      age: parseNumber(required.age),
      gender: required.gender ?? null,
      height_cm: parseNumber(required.height),
      weight_kg: parseNumber(required.weight),
      activity_level: required.activityLevel ?? null,
      fitness_goal: required.fitnessGoal ?? null,
      endurance_minutes: parseNumber(extra.endurance),
      preferred_environment: extra.preferredEnvironment ?? null,
      preferred_time_of_day: extra.preferredTimeOfDay ?? null,
      exercise_types: extra.exerciseTypes ?? null,
      fitness_level: extra.fitnessLevel ?? null,
      strength: {
        pushUps: parseNumber(strength.pushUps),
        squats: parseNumber(strength.squats),
        trainingDaysPerWeek: parseNumber(strength.trainingDaysPerWeek)
      }
    },
    preferences: {
      dietary_preferences: extra.dietaryPreferences ?? null,
      dietary_restrictions: extra.dietaryRestrictions ?? null,
      desired_activity_level: extra.desiredActivityLevel ?? null,
      session_duration: extra.sessionDuration ?? null,
      occupation_type: extra.occupationType ?? null
    },
    metadata: {
      generated_at: new Date().toISOString(),
      profile_completed: user.profileCompleted ?? false
    }
  });
};

// Persist an anonymized snapshot derived from the latest profile version.
export const recordProcessedMetricsSnapshot = async (
  userId: string,
  profileVersion: HealthProfileVersionDocument
) => {
  const userMetrics = buildUserMetrics(profileVersion);
  const privacyHash = createHash("sha256")
    .update(`${userId}:${profileVersion.versionId}`)
    .digest("hex");

  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

  const payload: Omit<ProcessedMetricsDocument, "createdAt"> = {
    userMetrics: userMetrics as Record<string, unknown>,
    privacyHash,
    sourceProfileVersion: profileVersion.versionId,
    expiresAt
  };

  await createProcessedMetrics(userId, payload);
};

export const recordProcessedMetricsFromUserDocument = async (userId: string) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const userMetrics = buildUserMetricsFromUserDocument(user);
  const privacyHash = createHash("sha256").update(`${userId}:user_doc`).digest("hex");
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

  const payload: Omit<ProcessedMetricsDocument, "createdAt"> = {
    userMetrics: userMetrics as Record<string, unknown>,
    privacyHash,
    sourceProfileVersion: 'user_document',
    expiresAt
  };

  await createProcessedMetrics(userId, payload);
};
