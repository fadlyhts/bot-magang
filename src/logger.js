import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "waha-reminder", environment: config.nodeEnv },
  redact: {
    paths: ["req.headers.authorization", "req.headers.x-api-key", "password", "apiKey"],
    censor: "[redacted]"
  }
});

