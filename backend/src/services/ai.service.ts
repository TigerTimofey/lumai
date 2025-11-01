import { createHash } from "crypto";
import axios from "axios";
import { Timestamp } from "firebase-admin/firestore";

import env from "../config/env.js";
import { CONSENT_TYPES } from "../domain/enums.js";
import { getLatestProfileVersion } from "../repositories/profile.repo.js";
import { createProcessedMetrics, listProcessedMetrics } from "../repositories/processed-metrics.repo.js";
import { getConsents } from "../repositories/consent.repo.js";
import { logAiInsight, saveAiInsightVersion } from "../repositories/ai-insight.repo.js";
import { forbidden, internalError, notFound, serviceUnavailable } from "../utils/api-error.js";
import { logger } from "../utils/logger.js";

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
    throw serviceUnavailable("AI insights temporarily unavailable: missing provider configuration");
  }

  const model = env.HF_MODEL ?? "meta-llama/Meta-Llama-3-8B-Instruct";
  const prompt = buildInsightPrompt(latestSnapshot.userMetrics);

  const requestBody = {
    model,
    max_tokens: 900,
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
    console.info('[ai-insights] generated content', { userId, model, length: content.length, preview: content.slice(0, 120) });

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

    const savedVersion = await saveAiInsightVersion(userId, {
      content,
      model,
      status: "success",
      usage: data?.usage ?? null,
      promptContext: {
        reason: "ai_health_insight",
        processedMetricsId: latestSnapshot.sourceProfileVersion
      }
    });

    return {
      content,
      model,
      version: savedVersion.version,
      createdAt: savedVersion.createdAt.toDate().toISOString()
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await logAiInsight(userId, {
      promptContext: {
        reason: "ai_health_insight",
        processedMetricsId: latestSnapshot.sourceProfileVersion
      },
      model,
      status: "errored",
      response: {
        error: errorMessage
      }
    });

    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED") {
        logger.warn({ userId, model }, "AI provider request timed out");
        throw serviceUnavailable("AI provider timed out. Please try again later.");
      }
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        logger.warn({ userId, model, status, error: errorMessage }, "AI provider authentication failed");
        throw serviceUnavailable("AI provider rejected the request. Please try again later.");
      }
      if (status === 429) {
        logger.warn({ userId, model, status }, "AI provider rate limit reached");
        throw serviceUnavailable("AI provider is busy. Please retry in a few moments.");
      }
      if (status && status >= 500) {
        logger.error({ userId, model, status, error: errorMessage }, "AI provider service error");
        throw serviceUnavailable("AI provider is currently unavailable. Please try again later.");
      }
      logger.error({ userId, model, status, error: errorMessage }, "Unexpected AI provider response");
      throw serviceUnavailable("Unexpected AI provider response. Please try again later.");
    }

    logger.error({ userId, model, error: errorMessage }, "AI insight generation failed");
    throw internalError("Failed to generate AI insight", errorMessage);
  }
};
