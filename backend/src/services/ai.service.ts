import { createHash } from "crypto";
import axios from "axios";
import { Timestamp } from "firebase-admin/firestore";

import env from "../config/env.js";
import { CONSENT_TYPES } from "../domain/enums.js";
import { getLatestProfileVersion } from "../repositories/profile.repo.js";
import { createProcessedMetrics, listProcessedMetrics } from "../repositories/processed-metrics.repo.js";
import { getConsents } from "../repositories/consent.repo.js";
import { logAiInsight } from "../repositories/ai-insight.repo.js";
import { forbidden, internalError, notFound } from "../utils/api-error.js";

const AI_CONSENT = "ai_insights" satisfies (typeof CONSENT_TYPES)[number];

export const prepareAiMetrics = async (userId: string) => {
  const consents = await getConsents(userId);
  const consentStatus = consents?.agreements?.[AI_CONSENT]?.status ?? "pending";

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
    sourceProfileVersion: latestProfile.versionId,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000))
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

const buildInsightPrompt = (metrics: Record<string, unknown>) => {
  const condensed = JSON.stringify(metrics, null, 2).slice(0, 6000);
  return `You are an empathetic wellness coach. Review the anonymized user metrics below and provide:
1. A brief health status summary (2 sentences).
2. Three actionable recommendations tailored to the goals and lifestyle.
3. A motivational note (one sentence).

Metrics JSON:
${condensed}`;
};

export const generateAiInsights = async (userId: string) => {
  const consents = await getConsents(userId);
  const consentStatus = consents?.agreements?.[AI_CONSENT]?.status ?? "pending";
  if (consentStatus !== "granted") {
    throw forbidden("User has not granted AI insights consent");
  }

  const [latestSnapshot] = await listProcessedMetrics(userId, 1);
  if (!latestSnapshot) {
    throw notFound("No processed metrics available for AI insights");
  }

  if (!env.HF_API_URL || !env.HF_API_KEY) {
    throw internalError("Hugging Face API configuration missing");
  }

  const model = env.HF_MODEL ?? "meta-llama/Meta-Llama-3-8B-Instruct";
  const prompt = buildInsightPrompt(latestSnapshot.userMetrics);

  const requestBody = {
    model,
    max_tokens: 600,
    temperature: 0.7,
    messages: [
      { role: "system", content: "You are an empathetic and motivational health coach." },
      { role: "user", content: prompt }
    ]
  };

  try {
    const { data } = await axios.post(
      env.HF_API_URL,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${env.HF_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 25_000
      }
    );

    const content: string = data?.choices?.[0]?.message?.content ?? "";

    const log = await logAiInsight(userId, {
      promptContext: {
        reason: "ai_health_insight",
        processedMetricsId: latestSnapshot.sourceProfileVersion
      },
      model,
      status: "success",
      response: {
        content,
        usage: data?.usage ?? null
      }
    });

    return {
      content,
      model,
      createdAt: log.createdAt ?? null
    };
  } catch (error) {
    await logAiInsight(userId, {
      promptContext: {
        reason: "ai_health_insight",
        processedMetricsId: latestSnapshot.sourceProfileVersion
      },
      model,
      status: "errored",
      response: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw internalError("Failed to generate AI insight", error);
  }
};
