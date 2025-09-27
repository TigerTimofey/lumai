import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase.js";

const ROOT_COLLECTION = "ai_insight_logs";

const insightCollection = (userId: string) =>
  firestore().collection(ROOT_COLLECTION).doc(userId).collection("insights");

export interface AiInsightLog {
  promptContext: Record<string, unknown>;
  model: string;
  response?: Record<string, unknown>;
  status: "success" | "errored";
  createdAt?: Timestamp;
  meta?: Record<string, unknown>;
}

export const logAiInsight = async (userId: string, payload: AiInsightLog) => {
  const doc = {
    ...payload,
    createdAt: payload.createdAt ?? Timestamp.now()
  };

  await insightCollection(userId).add(doc);
  return doc;
};

export const listAiInsights = async (userId: string, limit = 10) => {
  const snapshot = await insightCollection(userId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as AiInsightLog);
};
