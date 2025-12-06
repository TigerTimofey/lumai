import { Router } from "express";
import { authContext } from "../middleware/auth-context.js";
import { aiRateLimit } from "../middleware/ai-rate-limit.js";
import { unauthorized } from "../utils/api-error.js";
import {
  getAssistantConversationSnapshot,
  runAssistantChat
} from "../assistant/conversation/assistant-chat.service.js";

const router = Router();

router.use(authContext);

router.get("/conversation", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }
    const snapshot = await getAssistantConversationSnapshot(userId);
    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});

router.post("/chat", aiRateLimit, async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }
    const message = typeof req.body?.message === "string" ? req.body.message : "";
    const result = await runAssistantChat({
      userId,
      userName: req.authToken?.name ?? req.authUser?.additionalProfile?.firstName ?? req.authUser?.additionalProfile?.name ?? null,
      message
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

export default router;

