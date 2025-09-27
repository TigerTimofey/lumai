import { Router } from "express";
import { authContext } from "../middleware/auth-context.js";
import { generateProfileExport, validateExportRequest } from "../services/export.service.js";
import { unauthorized } from "../utils/api-error.js";

const router = Router();

router.use(authContext);

router.post("/", async (req, res, next) => {
  try {
    const userId = req.authToken?.uid;
    if (!userId) {
      throw unauthorized();
    }

    validateExportRequest(userId);
    const result = await generateProfileExport(userId);
    return res.status(202).json(result);
  } catch (error) {
    return next(error);
  }
});

export default router;
