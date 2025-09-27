import app from "./app";
import env from "./config/env";
import { logger } from "./utils/logger";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "HTTP server running");
});

const shutdown = () => {
  logger.info("Shutting down server");
  server.close(() => process.exit(0));
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
