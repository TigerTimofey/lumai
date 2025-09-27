import { createHash } from "crypto";
import env from "../config/env.js";
import { CONSENT_TYPES } from "../domain/enums.js";
import { getLatestProfileVersion } from "../repositories/profile.repo.js";
import { createProcessedMetrics } from "../repositories/processed-metrics.repo.js";
import { getConsents } from "../repositories/consent.repo.js";
import { logAiInsight } from "../repositories/ai-insight.repo.js";
import { forbidden, notFound } from "../utils/api-error.js";

const AI_CONSENT = "ai_insights" satisfies (typeof CONSENT_TYPES)[number];

export const prepareAiMetrics = async (userId: string) => {
  const consents = await getConsents(userId);
  const consentStatus = consents?.agreements?.[AI_CONSENT]?.status ?? "pending.js";

  if (consentStatus !== "granted") {
    throw forbidden("User has not granted AI insights consent");
  }

  const latestProfile = await getLatestProfileVersion(userId);
  if (!latestProfile) {
    throw notFound("No profile data to process");
  }

  const userMetrics = {
    current_state: {
      demographics: latestProfile.demographics,
      lifestyle: latestProfile.lifestyle,
      normalized: latestProfile.normalized
    },
    target_state: {
      goals: latestProfile.goals,
      desired_weight: latestProfile.goals.targetWeightKg,
      desired_activity: latestProfile.goals.targetActivityLevel
    },
    preferences: latestProfile.lifestyle.dietaryPreferences,
    restrictions: latestProfile.lifestyle.dietaryRestrictions,
    assessment: latestProfile.assessment,
    habits: latestProfile.habits
  };

  const privacyHash = createHash("sha256")
    .update(`${env.ANONYMIZATION_SALT}:${userId}`)
    .digest("hex");

  const snapshot = await createProcessedMetrics(userId, {
    userMetrics,
    privacyHash,
    sourceProfileVersion: latestProfile.versionId
  });

  await logAiInsight(userId, {
    promptContext: {
      reason: "processed_metrics_preparation",
      sourceProfileVersion: latestProfile.versionId
    },
    model: "pending",
    status: "success",
    response: {
      processedMetricsRef: snapshot
    }
  });

  return snapshot;
};
