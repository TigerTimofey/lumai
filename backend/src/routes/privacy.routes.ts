import { Router } from "express";
import { authContext } from "../middleware/auth-context.js";
import {
  getConsentSettings,
  recordConsent,
  updatePrivacyPreferences
} from "../services/consent.service.js";
import { badRequest, unauthorized } from "../utils/api-error.js";

const router = Router();

router.use(authContext);

router.get("/", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const consents = await getConsentSettings(userId);
    return res.json(consents);
  } catch (error) {
    return next(error);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const consents = await updatePrivacyPreferences(userId, req.body);
    return res.json(consents);
  } catch (error) {
    return next(error);
  }
});

router.post("/consents", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const { consentType, status } = req.body ?? {};
    if (!consentType || !status) {
      throw badRequest("consentType and status are required");
    }

    const consents = await recordConsent(userId, consentType, status, userId);
    return res.json(consents);
  } catch (error) {
    return next(error);
  }
});

export default router;
