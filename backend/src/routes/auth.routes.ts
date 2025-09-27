import { Router } from "express";
import { loginWithEmailPassword, refreshIdToken, registerUser } from "../services/auth.service.js";
import { badRequest } from "../utils/api-error.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body ?? {};

    if (!email || !password) {
      throw badRequest("Email and password are required");
    }

    const userRecord = await registerUser({ email, password, displayName });
    const authResponse = await loginWithEmailPassword(email, password);

    return res.status(201).json({
      message: "Registration successful",
      uid: userRecord.uid,
      tokens: {
        idToken: authResponse.idToken,
        refreshToken: authResponse.refreshToken,
        expiresIn: authResponse.expiresIn
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      throw badRequest("Email and password are required");
    }

    const result = await loginWithEmailPassword(email, password);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = req.body ?? {};

    if (!refreshToken) {
      throw badRequest("Refresh token is required");
    }

    const tokens = await refreshIdToken(refreshToken);
    return res.json(tokens);
  } catch (error) {
    return next(error);
  }
});

export default router;
