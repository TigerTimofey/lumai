import { randomUUID } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { normalizeHealthProfile, type HealthProfileInput } from "../domain/validation.js";
import {
  createProfileVersion,
  getLatestProfileVersion,
  getProfile,
  getProfileVersionById,
  listProfileVersions,
  upsertProfileSummary
} from "../repositories/profile.repo.js";
import { updateUserDocument } from "../repositories/user.repo.js";
import { badRequest, notFound } from "../utils/api-error.js";
import { recordProcessedMetricsSnapshot } from "./processed-metrics.service.js";

export const getProfileSummary = async (userId: string) => {
  const profile = await getProfile(userId);
  if (!profile) {
    throw notFound("Profile not found");
  }

  return profile;
};

export const getProfileVersion = async (userId: string, versionId?: string) => {
  if (!versionId) {
    const latest = await getLatestProfileVersion(userId);
    if (!latest) {
      throw notFound("No profile versions found");
    }
    return latest;
  }

  const snapshot = await getProfileVersionById(userId, versionId);
  if (!snapshot) {
    throw notFound("Requested profile version not found");
  }
  return snapshot;
};

export const listProfileHistory = async (
  userId: string,
  options?: { limit?: number; cursor?: string }
) => {
  const versions = await listProfileVersions(userId, options?.limit, options?.cursor);
  return versions;
};

export const upsertHealthProfile = async (userId: string, input: HealthProfileInput) => {
  const normalized = normalizeHealthProfile(input);

  const versionId = randomUUID();

  const versionDoc = await createProfileVersion(userId, {
    versionId,
    userId,
    demographics: normalized.demographics,
    physicalMetrics: normalized.physicalMetrics,
    lifestyle: normalized.lifestyle,
    goals: normalized.goals,
    assessment: normalized.assessment,
    habits: normalized.habits,
    normalized: normalized.normalized,
    source: "user"
  });

  await upsertProfileSummary(userId, {
    current: {
      demographics: normalized.demographics,
      physicalMetrics: normalized.physicalMetrics,
      lifestyle: normalized.lifestyle,
      goals: normalized.goals,
      assessment: normalized.assessment,
      habits: normalized.habits,
      normalized: normalized.normalized,
      updatedAt: Timestamp.now()
    },
    targets: {
      targetWeightKg: normalized.goals.targetWeightKg,
      targetActivityLevel: normalized.goals.targetActivityLevel
    }
  });

  await updateUserDocument(userId, {
    profileVersionId: versionDoc.versionId
  });

  try {
    await recordProcessedMetricsSnapshot(userId, versionDoc);
  } catch (error) {
    // Surface in logs but do not block profile updates
    console.warn('[processed-metrics] failed to record snapshot', error);
  }

  return {
    versionId: versionDoc.versionId,
    normalized: versionDoc.normalized,
    goals: versionDoc.goals,
    updatedAt: versionDoc.updatedAt
  };
};

export const validateProfileInput = (input: HealthProfileInput) => {
  try {
    return normalizeHealthProfile(input);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw badRequest(error.message);
    }

    throw badRequest("Invalid profile payload");
  }
};
