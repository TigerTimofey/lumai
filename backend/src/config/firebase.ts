import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import env from "./env";

const serviceAccount = env.serviceAccount as ServiceAccount;

const app = getApps()[0]
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
      projectId: env.FIREBASE_PROJECT_ID,
      storageBucket: env.FIREBASE_STORAGE_BUCKET ?? `${env.FIREBASE_PROJECT_ID}.appspot.com`
    });

export const firebaseAuth = () => getAuth(app);
export const firestore = () => getFirestore(app);
export const storage = () => getStorage(app);
