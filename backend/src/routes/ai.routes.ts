import { Router } from "express";
import { authContext } from "../middleware/auth-context.js";
import { prepareAiMetrics } from "../services/ai.service.js";
import { listAiInsights } from "../repositories/ai-insight.repo.js";
import { listProcessedMetrics } from "../repositories/processed-metrics.repo.js";
import { unauthorized } from "../utils/api-error.js";

const router = Router();

router.use(authContext);

router.post("/prepare", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const snapshot = await prepareAiMetrics(userId);
    return res.status(201).json(snapshot);
  } catch (error) {
    return next(error);
  }
});

router.get("/processed", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const snapshots = await listProcessedMetrics(userId, limit);
    return res.json({ snapshots });
  } catch (error) {
    return next(error);
  }
});

router.get("/insights", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const insights = await listAiInsights(userId, limit);
    return res.json({ insights });
  } catch (error) {
    return next(error);
  }
});

export default router;
