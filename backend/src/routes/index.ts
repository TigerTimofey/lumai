import { Router } from "express";
import aiRoutes from "./ai.routes.js";
import authRoutes from "./auth.routes.js";
import exportRoutes from "./export.routes.js";
import privacyRoutes from "./privacy.routes.js";
import profileRoutes from "./profile.routes.js";
import analyticsRoutes from "./analytics.routes.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/profile", profileRoutes);
router.use("/privacy", privacyRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/ai", aiRoutes);
router.use("/export", exportRoutes);

export default router;
