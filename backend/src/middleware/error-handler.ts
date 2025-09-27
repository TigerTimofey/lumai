import type { ErrorRequestHandler } from "express";
import { ApiError } from "../utils/api-error";
import { logger } from "../utils/logger";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    logger.warn({ err, path: req.path }, err.message);
    return res.status(err.status).json({ message: err.message, details: err.details });
  }

  logger.error({ err, path: req.path }, "Unhandled error");
  return res.status(500).json({ message: "Internal Server Error" });
};
