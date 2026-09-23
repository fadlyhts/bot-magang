import "dotenv/config";
import { IANAZone } from "luxon";
import { z } from "zod";

const positiveInteger = z.coerce.number().int().positive();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  APP_TIMEZONE: z.string().default("Asia/Jakarta").refine(IANAZone.isValidZone, "Invalid IANA timezone"),
  SCHEDULER_INTERVAL_SECONDS: positiveInteger.max(59).default(10),
  SCHEDULER_BATCH_SIZE: positiveInteger.max(100).default(10),
  SCHEDULER_LOCK_TIMEOUT_MINUTES: positiveInteger.max(60).default(5),
  MYSQL_HOST: z.string().default("127.0.0.1"),
  MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  MYSQL_DATABASE: z.string().default("waha_reminder"),
  MYSQL_USER: z.string().default("waha_reminder"),
  MYSQL_PASSWORD: z.string().default("local-development-only"),
  WAHA_URL: z.string().url().default("http://127.0.0.1:3000"),
  WAHA_API_KEY: z.string().min(1).default("local-development-only"),
  WAHA_SESSION: z.string().min(1).default("default"),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(8).default("change-me-now")
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = Object.freeze({
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  timezone: parsed.data.APP_TIMEZONE,
  schedulerIntervalSeconds: parsed.data.SCHEDULER_INTERVAL_SECONDS,
  schedulerBatchSize: parsed.data.SCHEDULER_BATCH_SIZE,
  schedulerLockTimeoutMinutes: parsed.data.SCHEDULER_LOCK_TIMEOUT_MINUTES,
  mysql: {
    host: parsed.data.MYSQL_HOST,
    port: parsed.data.MYSQL_PORT,
    database: parsed.data.MYSQL_DATABASE,
    user: parsed.data.MYSQL_USER,
    password: parsed.data.MYSQL_PASSWORD
  },
  waha: {
    url: parsed.data.WAHA_URL.replace(/\/$/, ""),
    apiKey: parsed.data.WAHA_API_KEY,
    session: parsed.data.WAHA_SESSION
  },
  admin: {
    username: parsed.data.ADMIN_USERNAME,
    password: parsed.data.ADMIN_PASSWORD
  }
});

