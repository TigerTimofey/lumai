import { Router } from "express";
import { authContext } from "../middleware/auth-context.js";
import { generateWeeklySummary, generateMonthlySummary } from "../services/health-summary.service.js";
import { generateHealthSummaryInsights } from "../services/ai.service.js";

const router = Router();

router.use(authContext);

// Get weekly health summary
router.get("/weekly", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Optional date parameter, defaults to current week
    const referenceDate = req.query.date ? new Date(req.query.date as string) : new Date();
    const includeAi = req.query.ai === 'true';

    if (isNaN(referenceDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const summary = await generateWeeklySummary(userId, referenceDate);

    if (includeAi) {
      try {
        const aiInsights = await generateHealthSummaryInsights(userId, summary);
        summary.aiInsights = aiInsights.aiInsights;
        summary.aiGeneratedAt = aiInsights.generatedAt;
      } catch (aiError) {
        // AI insights are optional, don't fail the whole request
        summary.aiInsights = "AI insights temporarily unavailable";
      }
    }

    return res.json(summary);
  } catch (error) {
    return next(error);
  }
});

// Get monthly health summary
router.get("/monthly", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Optional date parameter, defaults to current month
    const referenceDate = req.query.date ? new Date(req.query.date as string) : new Date();
    const includeAi = req.query.ai === 'true';

    if (isNaN(referenceDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const summary = await generateMonthlySummary(userId, referenceDate);

    if (includeAi) {
      try {
        const aiInsights = await generateHealthSummaryInsights(userId, summary);
        summary.aiInsights = aiInsights.aiInsights;
        summary.aiGeneratedAt = aiInsights.generatedAt;
      } catch (aiError) {
        // AI insights are optional, don't fail the whole request
        summary.aiInsights = "AI insights temporarily unavailable";
      }
    }

    return res.json(summary);
  } catch (error) {
    return next(error);
  }
});

export default router;