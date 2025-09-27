import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import env from "./env.js";

const serviceAccount = env.serviceAccount as ServiceAccount;

const app = getApps()[0]
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
      projectId: env.FIREBASE_PROJECT_ID
    });

export const firebaseAuth = () => getAuth(app);
export const firestore = () => getFirestore(app);
