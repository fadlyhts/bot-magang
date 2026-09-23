import { app } from "./app.js";
import { config } from "./config.js";
import { migrate, pool } from "./db/index.js";
import { logger } from "./logger.js";
import { startScheduler, stopScheduler } from "./services/scheduler.js";

let server;

async function start() {
  await migrate();
  server = app.listen(config.port, "0.0.0.0", () => {
    logger.info({ port: config.port, timezone: config.timezone }, "WAHA Reminder is listening");
  });
  startScheduler();
}

async function shutdown(signal) {
  logger.info({ signal }, "Shutting down");
  stopScheduler();
  await new Promise((resolve) => server?.close(resolve));
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

start().catch((error) => {
  logger.fatal({ err: error }, "Application startup failed");
  process.exit(1);
});

