import type { RequestHandler } from "express";
import { firebaseAuth } from "../config/firebase.js";
import env from "../config/env.js";
import { Timestamp } from "firebase-admin/firestore";
import { getUserById, updateUserDocument } from "../repositories/user.repo.js";
import { unauthorized } from "../utils/api-error.js";

export const authContext: RequestHandler = async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(unauthorized());
  }

  const idToken = authHeader.replace("Bearer ", "").trim();

  try {
    const decoded = await firebaseAuth().verifyIdToken(idToken, true);
    req.authToken = decoded;
    const user = await getUserById(decoded.uid);
    req.authUser = user;

    // Optional idle session enforcement based on lastActivityAt stored in DB
    if (env.SESSION_IDLE_MINUTES && env.SESSION_IDLE_MINUTES > 0 && user) {
      const nowMs = Date.now();
      const lastActivityMs = user.lastActivityAt ? (user.lastActivityAt as any).toMillis?.() ?? 0 : 0;
      const idleMs = env.SESSION_IDLE_MINUTES * 60 * 1000;
      if (lastActivityMs && nowMs - lastActivityMs > idleMs) {
        return next(unauthorized("Session expired due to inactivity"));
      }
      // Update last activity asynchronously (do not block request)
      void updateUserDocument(decoded.uid, { lastActivityAt: Timestamp.now() });
    }
    return next();
  } catch (error) {
    return next(unauthorized("Invalid or expired token"));
  }
};
