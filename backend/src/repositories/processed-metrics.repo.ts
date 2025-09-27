import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase.js";
import type { ProcessedMetricsDocument } from "../domain/types.js";

const ROOT_COLLECTION = "processed_metrics";

const processedMetricsCollection = (userId: string) =>
  firestore().collection(ROOT_COLLECTION).doc(userId).collection("snapshots");

export const createProcessedMetrics = async (
  userId: string,
  payload: Omit<ProcessedMetricsDocument, "createdAt">
) => {
  const now = Timestamp.now();
  const doc = {
    ...payload,
    createdAt: now
  } satisfies ProcessedMetricsDocument;

  await processedMetricsCollection(userId).add(doc);
  return doc;
};

export const listProcessedMetrics = async (userId: string, limit = 10) => {
  const snapshot = await processedMetricsCollection(userId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as ProcessedMetricsDocument);
};
