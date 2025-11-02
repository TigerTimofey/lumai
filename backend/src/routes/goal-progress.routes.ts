import { Router } from "express";
import { authContext } from "../middleware/auth-context.js";
import { generateGoalProgress } from "../services/goal-progress.service.js";

const router = Router();

router.use(authContext);

// Get goal progress with milestones
router.get("/", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const goalProgress = await generateGoalProgress(userId);

    if (!goalProgress) {
      return res.status(404).json({ message: "No goal progress data available" });
    }

    return res.json(goalProgress);
  } catch (error) {
    return next(error);
  }
});

export default router;