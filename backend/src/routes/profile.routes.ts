import { Router } from "express";
import { authContext } from "../middleware/auth-context";
import {
  getProfileSummary,
  getProfileVersion,
  listProfileHistory,
  upsertHealthProfile
} from "../services/profile.service";
import { unauthorized } from "../utils/api-error";

const router = Router();

router.use(authContext);

router.get("/", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const profile = await getProfileSummary(userId);
    return res.json(profile);
  } catch (error) {
    return next(error);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const versions = await listProfileHistory(userId, { limit, cursor });
    return res.json({ versions });
  } catch (error) {
    return next(error);
  }
});

router.get("/versions/:versionId?", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const profile = await getProfileVersion(userId, req.params.versionId);
    return res.json(profile);
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

    const profile = await upsertHealthProfile(userId, req.body);
    return res.status(200).json(profile);
  } catch (error) {
    return next(error);
  }
});

export default router;
