import { Router } from "express";
import aiRoutes from "./ai.routes";
import authRoutes from "./auth.routes";
import exportRoutes from "./export.routes";
import privacyRoutes from "./privacy.routes";
import profileRoutes from "./profile.routes";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/profile", profileRoutes);
router.use("/privacy", privacyRoutes);
router.use("/ai", aiRoutes);
router.use("/export", exportRoutes);

export default router;
