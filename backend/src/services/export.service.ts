import { Timestamp } from "firebase-admin/firestore";
import { storage } from "../config/firebase";
import { listAiInsights } from "../repositories/ai-insight.repo";
import { listProcessedMetrics } from "../repositories/processed-metrics.repo";
import { getProfile, listProfileVersions } from "../repositories/profile.repo";
import { getUserById } from "../repositories/user.repo";
import { badRequest, notFound } from "../utils/api-error";

export const generateProfileExport = async (userId: string) => {
  const user = await getUserById(userId);
  const profile = await getProfile(userId);

  if (!user || !profile) {
    throw notFound("User profile not found for export");
  }

  const versions = await listProfileVersions(userId, 50);
  const processedMetrics = await listProcessedMetrics(userId, 20);
  const aiLogs = await listAiInsights(userId, 20);

  const exportPayload = {
    generatedAt: Timestamp.now().toDate().toISOString(),
    user: {
      email: user.email,
      emailVerified: user.emailVerified,
      privacy: user.privacy
    },
    profile,
    versions,
    processedMetrics,
    aiLogs
  };

  const bucket = storage().bucket();
  const exportId = `${Date.now()}`;
  const filePath = `exports/${userId}/${exportId}.json`;
  const file = bucket.file(filePath);

  await file.save(JSON.stringify(exportPayload, null, 2), {
    gzip: true,
    metadata: {
      contentType: "application/json",
      metadata: {
        userId,
        exportId
      }
    }
  });

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 15 * 60 * 1000
  });

  return {
    exportId,
    filePath,
    signedUrl
  };
};

export const validateExportRequest = (userId: string) => {
  if (!userId) {
    throw badRequest("UserId is required");
  }
};
