import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase.js";
import type { ConsentsDocument } from "../domain/types.js";

const COLLECTION = "consents";

const consentDoc = (userId: string) => firestore().collection(COLLECTION).doc(userId);

export const getConsents = async (userId: string) => {
  const snapshot = await consentDoc(userId).get();
  return snapshot.exists ? (snapshot.data() as ConsentsDocument) : null;
};

export const setConsents = async (userId: string, data: ConsentsDocument) => {
  await consentDoc(userId).set(data);
  return data;
};

export const updateConsentStatus = async (
  userId: string,
  consentType: string,
  status: "granted" | "denied" | "pending",
  changedBy: string
) => {
  const ref = consentDoc(userId);
  const snapshot = await ref.get();
  const previous = snapshot.exists ? (snapshot.data() as ConsentsDocument) : null;
  const previousStatus = previous?.agreements?.[consentType]?.status ?? null;

  await ref.set(
    {
      agreements: {
        [consentType]: {
          consentType,
          status,
          updatedAt: Timestamp.now()
        }
      }
    },
    { merge: true }
  );

  await ref.update({
    auditTrail: FieldValue.arrayUnion({
      consentType,
      previousStatus,
      newStatus: status,
      changedAt: Timestamp.now(),
      changedBy
    })
  });
};
