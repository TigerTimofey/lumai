import type { RequestHandler } from "express";
import { firebaseAuth } from "../config/firebase.js";
import { getUserById } from "../repositories/user.repo.js";
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
    req.authUser = await getUserById(decoded.uid);
    return next();
  } catch (error) {
    return next(unauthorized("Invalid or expired token"));
  }
};
