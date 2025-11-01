import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase.js";

const LOG_ROOT = "ai_insight_logs";
const VERSION_ROOT = "ai_insights";

const insightLogCollection = (userId: string) =>
  firestore().collection(LOG_ROOT).doc(userId).collection("insights");

const insightVersionDoc = (userId: string) =>
  firestore().collection(VERSION_ROOT).doc(userId);

const insightVersionCollection = (userId: string) =>
  insightVersionDoc(userId).collection("versions");

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

  await insightLogCollection(userId).add(doc);
  return doc;
};

export const listAiInsights = async (userId: string, limit = 10) => {
  const snapshot = await insightLogCollection(userId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as AiInsightLog);
};

export interface AiInsightVersion {
  version: number;
  content: string | null;
  model: string | null;
  status: "success" | "errored";
  usage?: Record<string, unknown> | null;
  promptContext?: Record<string, unknown>;
  createdAt: Timestamp;
}

type AiInsightVersionInput = Omit<AiInsightVersion, "version" | "createdAt">;

export const saveAiInsightVersion = async (userId: string, input: AiInsightVersionInput) => {
  return firestore().runTransaction(async (tx) => {
    const rootRef = insightVersionDoc(userId);
    const snapshot = await tx.get(rootRef);
    const currentVersion = snapshot.exists ? Number(snapshot.data()?.currentVersion ?? 0) : 0;
    const totalVersions = snapshot.exists ? Number(snapshot.data()?.totalVersions ?? currentVersion) : currentVersion;
    const nextVersion = currentVersion + 1;
    const createdAt = Timestamp.now();

    const versionDocRef = insightVersionCollection(userId).doc();
    const versionDoc: AiInsightVersion = {
      version: nextVersion,
      createdAt,
      content: input.content,
      model: input.model,
      status: input.status,
      usage: input.usage ?? null,
      promptContext: input.promptContext
    };

    tx.set(versionDocRef, versionDoc);
    tx.set(
      rootRef,
      {
        currentVersion: nextVersion,
        totalVersions: totalVersions + 1,
        updatedAt: createdAt,
        latestVersionId: versionDocRef.id,
        latestSummary: {
          version: nextVersion,
          model: input.model ?? null,
          status: input.status,
          createdAt
        }
      },
      { merge: true }
    );

    return versionDoc;
  });
};

export const listAiInsightVersions = async (userId: string, limit = 10) => {
  const snapshot = await insightVersionCollection(userId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as AiInsightVersion);
};

export const getLatestAiInsight = async (userId: string) => {
  const snapshot = await insightVersionCollection(userId)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as AiInsightVersion;
};
