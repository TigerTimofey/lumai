import cors from "cors";
import express from "express";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import pinoHttp from "pino-http";
const pinoHttpMiddleware = (pinoHttp as any).default ? (pinoHttp as any).default : pinoHttp;
import { errorHandler } from "./middleware/error-handler.js";
import router from "./routes/index.js";
import { logger } from "./utils/logger.js";

const app = express();

app.use(cors());
app.use(pinoHttpMiddleware({ logger }));

app.use("/api", router);

app.use((req, res) => {
  res.status(404).json({ message: "Not Found", path: req.path });
});

app.use(errorHandler);

export default app;
