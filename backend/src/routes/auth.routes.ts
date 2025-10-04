import { Router } from "express";
import { authContext } from "../middleware/auth-context.js";
import {
  activateMfa,
  disableMfa,
  enrollMfa,
  loginWithEmailPassword,
  loginWithOAuth,
  refreshIdToken,
  registerUser,
  sendPasswordResetEmail,
  sendVerificationEmail
} from "../services/auth.service.js";
import {
  loginSchema,
  mfaEnrollSchema,
  mfaVerifySchema,
  oauthSchema,
  passwordResetSchema,
  refreshSchema,
  registerSchema,
  sendVerificationSchema
} from "../domain/auth.validation.js";
import { ApiError, badRequest } from "../utils/api-error.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const { email, password, displayName } = registerSchema.parse(req.body ?? {});
    const { userRecord, verificationLink } = await registerUser({ email, password, displayName });
    // Try to auto-login, but don't fail registration if email isn't verified yet
    let tokens: { idToken: string; refreshToken: string; expiresIn: string } | null = null;
    try {
      const authResponse = await loginWithEmailPassword(email, password);
      tokens = {
        idToken: authResponse.idToken,
        refreshToken: authResponse.refreshToken,
        expiresIn: authResponse.expiresIn
      };
    } catch (err) {
      // If it's a 403 (unverified email / MFA), proceed without tokens
      if (!(err instanceof ApiError && err.status === 403)) {
        throw err;
      }
    }

    const body: any = {
      message: "Registration successful",
      uid: userRecord.uid,
      verificationLink
    };
    if (tokens) body.tokens = tokens;
    return res.status(201).json(body);
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password, mfaCode } = loginSchema.parse(req.body ?? {});
    const result = await loginWithEmailPassword(email, password, mfaCode);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/oauth", async (req, res, next) => {
  try {
    const { providerId, idToken, accessToken, mfaCode } = oauthSchema.parse(req.body ?? {});
    const result = await loginWithOAuth(providerId, { idToken, accessToken }, mfaCode);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body ?? {});
    const tokens = await refreshIdToken(refreshToken);
    return res.json(tokens);
  } catch (error) {
    return next(error);
  }
});

router.post("/password-reset", async (req, res, next) => {
  try {
    const { email } = passwordResetSchema.parse(req.body ?? {});
    const link = await sendPasswordResetEmail(email);
    return res.json({ message: "Password reset link generated", ...link });
  } catch (error) {
    return next(error);
  }
});

router.post("/send-verification", async (req, res, next) => {
  try {
    const { email } = sendVerificationSchema.parse(req.body ?? {});
    const link = await sendVerificationEmail(email);
    return res.json({ message: "Verification link generated", ...link });
  } catch (error) {
    return next(error);
  }
});

router.post("/mfa/enroll", authContext, async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw badRequest("Missing user context");
    }
    const { label } = mfaEnrollSchema.parse(req.body ?? {});
    const secret = await enrollMfa(userId, label);
    return res.json({ message: "MFA secret issued", ...secret });
  } catch (error) {
    return next(error);
  }
});

router.post("/mfa/activate", authContext, async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw badRequest("Missing user context");
    }
    const { code } = mfaVerifySchema.parse(req.body ?? {});
    const result = await activateMfa(userId, code);
    return res.json({ message: "MFA enabled", ...result });
  } catch (error) {
    return next(error);
  }
});

router.post("/mfa/disable", authContext, async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw badRequest("Missing user context");
    }
    const result = await disableMfa(userId);
    return res.json({ message: "MFA disabled", ...result });
  } catch (error) {
    return next(error);
  }
});

// Simple protected endpoint to verify token and return user context
router.get("/whoami", authContext, async (req, res) => {
  const token = req.authToken;
  const user = req.authUser;
  return res.json({
    uid: token?.uid,
    email: user?.email,
    emailVerified: user?.emailVerified,
    mfa: user?.mfa ?? { enabled: false },
    lastActivityAt: user?.lastActivityAt ?? null
  });
});

export default router;
