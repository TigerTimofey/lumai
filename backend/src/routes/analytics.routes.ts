import { Router } from "express";
import { authContext } from "../middleware/auth-context.js";
import { recordProcessedMetricsFromUserDocument } from "../services/processed-metrics.service.js";

const router = Router();

router.use(authContext);

router.post("/process", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await recordProcessedMetricsFromUserDocument(userId);

    return res.status(202).json({ message: "Processed metrics snapshot created" });
  } catch (error) {
    return next(error);
  }
});

export default router;
