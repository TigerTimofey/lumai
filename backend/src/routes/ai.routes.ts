import { Router } from "express";
import { authContext } from "../middleware/auth-context.js";
import { prepareAiMetrics, generateAiInsights } from "../services/ai.service.js";
import { getLatestAiInsight, listAiInsightVersions } from "../repositories/ai-insight.repo.js";
import { listProcessedMetrics } from "../repositories/processed-metrics.repo.js";
import { unauthorized } from "../utils/api-error.js";
import { aiRateLimit } from "../middleware/ai-rate-limit.js";

const router = Router();

router.use(authContext);

router.post("/prepare", aiRateLimit, async (req, res, next) => {
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

router.post("/insights", aiRateLimit, async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const insight = await generateAiInsights(userId);
    return res.status(201).json(insight);
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
    const versions = await listAiInsightVersions(userId, limit ?? 10);
    const serialized = versions.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toDate().toISOString()
    }));
    return res.json({ insights: serialized });
  } catch (error) {
    return next(error);
  }
});

router.get("/insights/latest", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    const latest = await getLatestAiInsight(userId);
    return res.json({
      insight: latest
        ? {
            ...latest,
            createdAt: latest.createdAt.toDate().toISOString()
          }
        : null
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
