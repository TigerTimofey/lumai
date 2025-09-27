import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase";
import type { UserDocument } from "../domain/types";

const COLLECTION = "users";

export const userCollection = () => firestore().collection(COLLECTION);

export const getUserById = async (uid: string) => {
  const snapshot = await userCollection().doc(uid).get();
  return snapshot.exists ? (snapshot.data() as UserDocument) : null;
};

export const createUserDocument = async (uid: string, data: Omit<UserDocument, "createdAt" | "updatedAt">) => {
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
