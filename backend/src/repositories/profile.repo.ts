import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase";
import type {
  HealthProfileDocument,
  HealthProfileVersionDocument
} from "../domain/types";

const ROOT_COLLECTION = "health_profiles";

const profileDoc = (userId: string) => firestore().collection(ROOT_COLLECTION).doc(userId);

const profileVersionCollection = (userId: string) => profileDoc(userId).collection("versions");

export const getProfile = async (userId: string) => {
  const snapshot = await profileDoc(userId).get();
  return snapshot.exists ? (snapshot.data() as HealthProfileDocument) : null;
};

export const getLatestProfileVersion = async (userId: string) => {
  const snapshot = await profileVersionCollection(userId)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as HealthProfileVersionDocument;
};

export const getProfileVersionById = async (userId: string, versionId: string) => {
  const snapshot = await profileVersionCollection(userId).doc(versionId).get();
  return snapshot.exists ? (snapshot.data() as HealthProfileVersionDocument) : null;
};

export const listProfileVersions = async (
  userId: string,
  limit = 20,
  startAfterVersionId?: string
) => {
  let query = profileVersionCollection(userId)
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (startAfterVersionId) {
    const cursor = await profileVersionCollection(userId).doc(startAfterVersionId).get();
    if (cursor.exists) {
      query = query.startAfter(cursor);
    }
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => doc.data() as HealthProfileVersionDocument);
};

export const createProfileVersion = async (
  userId: string,
  payload: Omit<HealthProfileVersionDocument, "createdAt" | "updatedAt">
) => {
  const now = Timestamp.now();
  const versionDoc: HealthProfileVersionDocument = {
    ...payload,
    createdAt: now,
    updatedAt: now
  };

  await profileVersionCollection(userId).doc(payload.versionId).set(versionDoc);
  return versionDoc;
};

export const upsertProfileSummary = async (
  userId: string,
  summary: Omit<HealthProfileDocument, "stats">
) => {
  const now = Timestamp.now();
  const existing = await getProfile(userId);

  const stats = existing?.stats ?? { versionsCount: 0, lastUpdated: now };

  const updatedStats = {
    versionsCount: stats.versionsCount + 1,
    lastUpdated: now
  };

  const document: HealthProfileDocument = {
    ...summary,
    stats: updatedStats
  };

  await profileDoc(userId).set(document, { merge: true });
  return document;
};
