import { createHash } from "crypto";
import axios from "axios";
import { Timestamp } from "firebase-admin/firestore";

import env from "../config/env.js";
import { CONSENT_TYPES } from "../domain/enums.js";
import { getLatestProfileVersion } from "../repositories/profile.repo.js";
import { createProcessedMetrics, listProcessedMetrics } from "../repositories/processed-metrics.repo.js";
import { getConsents } from "../repositories/consent.repo.js";
import { logAiInsight, saveAiInsightVersion, getLatestAiInsight } from "../repositories/ai-insight.repo.js";
import { forbidden, internalError, notFound, serviceUnavailable } from "../utils/api-error.js";
import { logger } from "../utils/logger.js";

const AI_CONSENT = "ai_insights" satisfies (typeof CONSENT_TYPES)[number];

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const extractFallbackMetrics = (payload: Record<string, unknown> | undefined) => {
  const current = (payload?.current_state ?? {}) as Record<string, unknown>;
  const normalized = (payload?.normalized ?? current?.normalized ?? {}) as Record<string, unknown>;
  const habits = (payload?.habits ?? {}) as Record<string, unknown>;

  const weight = toNumber(current?.weight_kg ?? current?.weightKg ?? normalized?.weightKg ?? normalized?.weight_kg);
  const bmi = toNumber(current?.bmi ?? normalized?.bmi);
  const weeklyActivity = toNumber(current?.weekly_activity_frequency ?? current?.weeklyActivityFrequency);
  const sleepHours = toNumber(habits?.sleep_hours ?? habits?.sleepHours);
  const waterLiters = toNumber(habits?.water_intake_liters ?? habits?.waterIntakeLiters);
  const stress = typeof habits?.stress_level === "string"
    ? (habits?.stress_level as string)
    : (typeof habits?.stressLevel === "string" ? (habits?.stressLevel as string) : null);

  return { weight, bmi, weeklyActivity, sleepHours, waterLiters, stress };
};

const buildFallbackInsight = (payload: Record<string, unknown> | undefined) => {
  const metrics = extractFallbackMetrics(payload);

  const formatWeight = () => metrics.weight != null ? `${metrics.weight.toFixed(1)} kg` : "your current weight";
  const formatBmi = () => metrics.bmi != null ? `${metrics.bmi.toFixed(1)}` : "a healthy range";
  const formatActivity = () => metrics.weeklyActivity != null ? `${Math.max(3, Math.round(metrics.weeklyActivity))} weekly sessions` : "regular weekly activity";
  const formatSleep = () => metrics.sleepHours != null ? `${metrics.sleepHours.toFixed(1)} hours of sleep` : "consistent sleep";
  const formatWater = () => metrics.waterLiters != null ? `${metrics.waterLiters.toFixed(1)} L of water` : "solid hydration";
  const stressNote = metrics.stress ? ` Stress level is currently ${metrics.stress}.` : "";

  return `**Health status summary**\nYou're maintaining ${formatWeight()} with a BMI near ${formatBmi()}. Training cadence averages ${formatActivity()}, supported by ${formatSleep()} and ${formatWater()} each day.${stressNote}\n\n**Three actionable recommendations**\n1. Schedule your key workouts and recovery blocks at the start of each week.\n2. Prioritise nutrient-dense meals and hydration to reinforce energy and sleep quality.\n3. Record a short reflection after sessions to track progress and adjust intensity early.\n\n**Daily focus tasks**\n- Complete a 10-minute mobility or stretching routine.\n- Prepare a balanced meal or snack that aligns with your goals.\n- Review tomorrow's plan and set a simple, specific intention.\n\n**Motivational note**\nYou already have the data and habits in motion—stay consistent and celebrate every small win.`;
};

const ensureInsightQuality = (content: string, payload: Record<string, unknown> | undefined) => {
  const REQUIRED_HEADINGS = [
    "Health status summary",
    "Three actionable recommendations",
    "Daily focus tasks",
    "Motivational note"
  ];

  const hasHeadings = REQUIRED_HEADINGS.every((heading) => new RegExp(`\\*\\*${heading}\\*\\*`, "i").test(content));
  const numberedItems = (content.match(/\n\s*\d+\.\s+/g) ?? []).length;
  const bulletItems = (content.match(/\n\s*-\s+/g) ?? []).length;

  if (hasHeadings && numberedItems >= 3 && bulletItems >= 3) {
    return { content, replaced: false };
  }

  const fallback = buildFallbackInsight(payload);
  return { content: fallback, replaced: true };
};

export const determineInsightPriority = (content: string): "high" | "medium" | "low" => {
  const lowerContent = content.toLowerCase();

  // High priority indicators - critical health concerns
  const highPriorityKeywords = [
    'significant weight loss', 'rapid weight change', 'extreme stress',
    'severe sleep deprivation', 'critical', 'urgent', 'immediate attention',
    'health risk', 'dangerous', 'concerning trend', 'alarming',
    'weeks without activity', 'no exercise', 'sedentary for weeks'
  ];

  // Medium priority indicators - important but not critical
  const mediumPriorityKeywords = [
    'improve sleep', 'better nutrition', 'increase activity',
    'stress management', 'moderate', 'concerning', 'needs attention',
    'should focus on', 'recommend', 'consider', 'important'
  ];

  // Check for high priority first
  if (highPriorityKeywords.some(keyword => lowerContent.includes(keyword))) {
    return 'high';
  }

  // Check for medium priority
  if (mediumPriorityKeywords.some(keyword => lowerContent.includes(keyword))) {
    return 'medium';
  }

  // Default to low priority for general motivation and maintenance
  return 'low';
};

const validateRecommendations = (content: string, restrictions: string[] = []) => {
  if (!restrictions.length) return content;

  // Parse recommendations section
  const lines = content.split('\n');
  const recommendationsStart = lines.findIndex(line => line.includes('**Three actionable recommendations**'));
  
  if (recommendationsStart === -1) return content;

  const recommendationsEnd = lines.findIndex((line, index) => 
    index > recommendationsStart && line.includes('**') && !line.includes('recommendations')
  );

  const recommendationsSection = recommendationsEnd === -1 
    ? lines.slice(recommendationsStart + 1)
    : lines.slice(recommendationsStart + 1, recommendationsEnd);

  // Filter recommendations that don't violate restrictions
  const validatedRecommendations = recommendationsSection
    .filter(line => {
      if (!line.trim() || !line.match(/^\d+\./)) return true; // Keep non-recommendation lines
      
      const recommendation = line.toLowerCase();
      const violatesRestriction = restrictions.some(restriction => {
        const restrictionLower = restriction.toLowerCase();
        // Check for common dietary restriction violations
        if (restrictionLower.includes('vegetarian') && 
            (recommendation.includes('meat') || recommendation.includes('chicken') || 
             recommendation.includes('beef') || recommendation.includes('fish'))) {
          return true;
        }
        if (restrictionLower.includes('vegan') && 
            (recommendation.includes('meat') || recommendation.includes('dairy') || 
             recommendation.includes('milk') || recommendation.includes('cheese') || 
             recommendation.includes('yogurt') || recommendation.includes('butter') ||
             recommendation.includes('eggs') || recommendation.includes('honey'))) {
          return true;
        }
        if (restrictionLower.includes('gluten') && 
            recommendation.includes('wheat') || recommendation.includes('bread') || 
            recommendation.includes('pasta')) {
          return true;
        }
        if (restrictionLower.includes('dairy') && 
            recommendation.includes('milk') || recommendation.includes('cheese') || 
            recommendation.includes('yogurt') || recommendation.includes('butter') ||
            recommendation.includes('cream')) {
          return true;
        }
        return false;
      });
      
      return !violatesRestriction;
    });

  // If we filtered out recommendations, replace the section
  if (validatedRecommendations.length !== recommendationsSection.length) {
    const beforeRecommendations = lines.slice(0, recommendationsStart + 1);
    const afterRecommendations = recommendationsEnd === -1 ? [] : lines.slice(recommendationsEnd);
    
    // Add fallback recommendations if all were filtered out
    let finalRecommendations = validatedRecommendations;
    if (validatedRecommendations.filter(line => line.match(/^\d+\./)).length === 0) {
      finalRecommendations = [
        '1. Focus on maintaining a consistent daily routine with adequate sleep and hydration.',
        '2. Incorporate gentle daily movement like walking or stretching.',
        '3. Track your progress and celebrate small achievements in your wellness journey.'
      ];
    }
    
    return [...beforeRecommendations, ...finalRecommendations, ...afterRecommendations].join('\n');
  }

  return content;
};

const tryReturnCachedInsights = async (userId: string, model: string, errorMessage: string) => {
  try {
    const cachedInsight = await getLatestAiInsight(userId);
    if (cachedInsight && cachedInsight.status === 'success' && cachedInsight.content) {
      console.info('[ai-insights] returning cached insight due to service unavailability', {
        userId,
        cachedVersion: cachedInsight.version,
        cachedCreatedAt: cachedInsight.createdAt.toDate().toISOString(),
        originalError: errorMessage
      });

      // Add a note that this is cached content
      const cachedContent = cachedInsight.content + '\n\n*Note: This insight was generated previously. The AI service is currently unavailable.*';

      return {
        content: cachedContent,
        model: cachedInsight.model ?? model,
        version: cachedInsight.version,
        createdAt: cachedInsight.createdAt.toDate().toISOString(),
        isCached: true
      };
    }
  } catch (cacheError) {
    console.warn('[ai-insights] failed to retrieve cached insight', { userId, cacheError });
  }
  return null;
};

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
  return `You are an empathetic wellness coach. Review the anonymized user metrics below and reply in Markdown with the following sections exactly:

**Health status summary**
Two sentences describing the user's current state.

**Three actionable recommendations**
Provide three numbered recommendations tailored to the user's goals and lifestyle.

**Daily focus tasks**
List three short bullet items (imperative voice) that the user can complete today. Each item must start with a hyphen (-).

**Motivational note**
One uplifting sentence.

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

    // Get user restrictions for validation
    const latestProfile = await getLatestProfileVersion(userId);
    const userRestrictions = latestProfile?.lifestyle?.dietaryRestrictions ?? [];

    // Validate recommendations against health restrictions
    const validatedContent = validateRecommendations(content, userRestrictions);

    if (validatedContent !== content) {
      console.info('[ai-insights] content validated', { 
        userId, 
        originalLength: content.length, 
        validatedLength: validatedContent.length,
        restrictions: userRestrictions 
      });
    }

    const { content: qualityCheckedContent, replaced: replacedWithFallback } = ensureInsightQuality(
      validatedContent,
      latestSnapshot.userMetrics as Record<string, unknown> | undefined
    );

    if (replacedWithFallback) {
      logger.warn({ userId }, '[ai-insights] generated content replaced with fallback for quality assurance');
    }

    const log = await logAiInsight(userId, {
      promptContext: {
        reason: "ai_health_insight",
        processedMetricsId: latestSnapshot.sourceProfileVersion
      },
      model,
      status: "success",
      response: {
        content: qualityCheckedContent,
        usage: data?.usage ?? null
      }
    });

    const savedVersion = await saveAiInsightVersion(userId, {
      content: qualityCheckedContent,
      model,
      status: "success",
      priority: determineInsightPriority(qualityCheckedContent),
      usage: data?.usage ?? null,
      promptContext: {
        reason: "ai_health_insight",
        processedMetricsId: latestSnapshot.sourceProfileVersion
      }
    });

    return {
      content: qualityCheckedContent,
      model,
      version: savedVersion.version,
      createdAt: savedVersion.createdAt.toDate().toISOString(),
      priority: savedVersion.priority
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
        // Try to return cached insights for timeout
        const cachedResult = await tryReturnCachedInsights(userId, model, errorMessage);
        if (cachedResult) return cachedResult;
        throw serviceUnavailable("AI provider timed out. Please try again later.");
      }
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        logger.warn({ userId, model, status, error: errorMessage }, "AI provider authentication failed");
        // Try to return cached insights for auth failures
        const cachedResult = await tryReturnCachedInsights(userId, model, errorMessage);
        if (cachedResult) return cachedResult;
        throw serviceUnavailable("AI provider rejected the request. Please try again later.");
      }
      if (status === 429) {
        logger.warn({ userId, model, status }, "AI provider rate limit reached");
        // Try to return cached insights for rate limiting
        const cachedResult = await tryReturnCachedInsights(userId, model, errorMessage);
        if (cachedResult) return cachedResult;
        throw serviceUnavailable("AI provider is busy. Please retry in a few moments.");
      }
      if (status && status >= 500) {
        logger.error({ userId, model, status, error: errorMessage }, "AI provider service error");
        // Try to return cached insights for server errors
        const cachedResult = await tryReturnCachedInsights(userId, model, errorMessage);
        if (cachedResult) return cachedResult;
        throw serviceUnavailable("AI provider is currently unavailable. Please try again later.");
      }
      logger.error({ userId, model, status, error: errorMessage }, "Unexpected AI provider response");
      // Try to return cached insights for unexpected responses
      const cachedResult = await tryReturnCachedInsights(userId, model, errorMessage);
      if (cachedResult) return cachedResult;
      throw serviceUnavailable("Unexpected AI provider response. Please try again later.");
    }

    logger.error({ userId, model, error: errorMessage }, "AI insight generation failed");
    // Try to return cached insights for general errors
    const cachedResult = await tryReturnCachedInsights(userId, model, errorMessage);
    if (cachedResult) return cachedResult;
    throw internalError("Failed to generate AI insight", errorMessage);
  }
};

// Generate AI-powered health summary insights
export const generateHealthSummaryInsights = async (
  userId: string,
  summaryData: {
    period: 'weekly' | 'monthly';
    metrics: any;
    progress: any;
    keyInsights: string[];
    recommendations: string[];
  }
) => {
  try {
    // Check AI consent
    const consents = await getConsents(userId);
    if (!consents || consents.agreements[AI_CONSENT]?.status !== "granted") {
      throw forbidden("AI insights consent required");
    }

    const prompt = `Based on the following ${summaryData.period} health summary data, provide 2-3 intelligent insights and 1-2 personalized recommendations. Focus on trends, improvements, and actionable advice.

Health Metrics:
- Average Weight: ${summaryData.metrics.averageWeight ? summaryData.metrics.averageWeight.toFixed(1) + 'kg' : 'Not available'}
- Average BMI: ${summaryData.metrics.averageBmi ? summaryData.metrics.averageBmi.toFixed(1) : 'Not available'}
- Average Wellness Score: ${summaryData.metrics.averageWellnessScore ? Math.round(summaryData.metrics.averageWellnessScore) : 'Not available'}
- Average Sleep: ${summaryData.metrics.averageSleepHours ? summaryData.metrics.averageSleepHours.toFixed(1) + ' hours' : 'Not available'}
- Average Water Intake: ${summaryData.metrics.averageWaterIntake ? summaryData.metrics.averageWaterIntake.toFixed(1) + ' liters' : 'Not available'}
- Total Workouts: ${summaryData.metrics.totalWorkouts}
- Average Workout Duration: ${summaryData.metrics.averageWorkoutDuration ? Math.round(summaryData.metrics.averageWorkoutDuration) + ' minutes' : 'Not available'}
- Most Active Day: ${summaryData.metrics.mostActiveDay || 'Not available'}
- Consistency Score: ${summaryData.metrics.consistencyScore}%

Progress Changes:
- Weight Change: ${summaryData.progress.weightChange ? summaryData.progress.weightChange.toFixed(1) + 'kg' : 'Not available'}
- BMI Change: ${summaryData.progress.bmiChange ? summaryData.progress.bmiChange.toFixed(1) : 'Not available'}
- Wellness Score Change: ${summaryData.progress.wellnessScoreChange ? Math.round(summaryData.progress.wellnessScoreChange) : 'Not available'}
- Sleep Improvement: ${summaryData.progress.sleepImprovement ? summaryData.progress.sleepImprovement.toFixed(1) + ' hours' : 'Not available'}
- Water Intake Improvement: ${summaryData.progress.waterIntakeImprovement ? summaryData.progress.waterIntakeImprovement.toFixed(1) + ' liters' : 'Not available'}
- Activity Increase: ${summaryData.progress.activityIncrease ? Math.round(summaryData.progress.activityIncrease) + '%' : 'Not available'}

Existing Insights: ${summaryData.keyInsights.join(', ')}
Existing Recommendations: ${summaryData.recommendations.join(', ')}

Please provide:
1. 2-3 intelligent insights about trends and patterns
2. 1-2 personalized recommendations based on the data

Keep it concise and actionable.`;

    const response = await axios.post(
      env.HF_API_URL || "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium",
      {
        inputs: prompt,
        parameters: {
          max_new_tokens: 300,
          temperature: 0.7,
          do_sample: true,
          return_full_text: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const content = response.data[0]?.generated_text?.trim();
    if (!content) {
      throw new Error("Empty response from AI service");
    }

    // Log the AI insight generation
    await logAiInsight(userId, {
      promptContext: {
        type: "health_summary",
        period: summaryData.period,
        wellnessScore: summaryData.metrics.averageWellnessScore,
      },
      model: "health-summary-insights",
      response: { content },
      status: "success",
      meta: {
        period: summaryData.period,
        generatedAt: new Date().toISOString(),
      },
    });

    return {
      aiInsights: content,
      generatedAt: new Date().toISOString(),
    };

  } catch (error: any) {
    const errorMessage = error.message || "Unknown AI service error";

    logger.error({ userId, period: summaryData.period, error: errorMessage }, "Failed to generate health summary AI insights");

    // For health summaries, we can provide basic insights even if AI fails
    return {
      aiInsights: "AI insights temporarily unavailable. Basic summary analysis provided above.",
      generatedAt: new Date().toISOString(),
      fallback: true,
    };
  }
};
