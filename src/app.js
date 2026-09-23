import compression from "compression";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { config } from "./config.js";
import { pool } from "./db/index.js";
import { requireAdmin } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { logger } from "./logger.js";
import { reminderRouter } from "./routes/reminders.js";
import { wahaRouter } from "./routes/waha.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok", timezone: config.timezone, displayTimezone: "WIB", currentTime: new Date().toISOString() });
});

app.use(requireAdmin);
app.use("/api/reminders", reminderRouter);
app.use("/api/waha", wahaRouter);
app.use(express.static("public", { extensions: ["html"] }));

app.use(notFound);
app.use(errorHandler);
