import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase.js";
import type { UserDocument } from "../domain/types.js";

const COLLECTION = "users";

export const userCollection = () => firestore().collection(COLLECTION);

export const getUserById = async (uid: string) => {
  const snapshot = await userCollection().doc(uid).get();
  return snapshot.exists ? (snapshot.data() as UserDocument) : null;
};

export const createUserDocument = async (
  uid: string,
  data: Omit<UserDocument, "createdAt" | "updatedAt">
) => {
  const now = Timestamp.now();
  const payload: UserDocument = {
    ...data,
    createdAt: now,
    updatedAt: now
  };
  await userCollection().doc(uid).set(payload);
  return payload;
};

export const updateUserDocument = async (uid: string, data: Partial<UserDocument>) => {
  await userCollection().doc(uid).set(
    {
      ...data,
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );

  return getUserById(uid);
};

export const setUserMfa = async (
  uid: string,
  mfa: Partial<NonNullable<UserDocument["mfa"]>> & { enabled: boolean }
) => {
  const payload: Record<string, unknown> = {
    enabled: mfa.enabled
  };

  if (Object.prototype.hasOwnProperty.call(mfa, "secret")) {
    payload.secret = mfa.secret === null ? FieldValue.delete() : mfa.secret;
  }

  if (Object.prototype.hasOwnProperty.call(mfa, "otpauthUrl")) {
    payload.otpauthUrl = mfa.otpauthUrl === null ? FieldValue.delete() : mfa.otpauthUrl;
  }

  if (mfa.enrolledAt) {
    payload.enrolledAt = mfa.enrolledAt;
  } else if (mfa.enabled === false) {
    payload.enrolledAt = FieldValue.delete();
  }

  await userCollection()
    .doc(uid)
    .set(
      {
        mfa: payload,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    );

  return getUserById(uid);
};
