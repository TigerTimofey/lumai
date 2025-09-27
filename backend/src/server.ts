import app from "./app.js";
import env from "./config/env.js";
import { logger } from "./utils/logger.js";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "HTTP server running");
});

const shutdown = () => {
  logger.info("Shutting down server");
  server.close(() => process.exit(0));
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
