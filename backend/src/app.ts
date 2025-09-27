import cors from "cors";
import express from "express";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pinoHttp = require("pino-http");
import { errorHandler } from "./middleware/error-handler.js";
import router from "./routes/index.js";
import { logger } from "./utils/logger.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger }));

app.use("/api", router);

app.use((req, res) => {
  res.status(404).json({ message: "Not Found", path: req.path });
});

app.use(errorHandler);

export default app;
