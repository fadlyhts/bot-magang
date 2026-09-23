import "dotenv/config";
import { pool } from "../src/db/index.js";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8080";
const authorization = `Basic ${Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString("base64")}`;
let reminderId;

async function request(path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    throw new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

try {
  const health = await request("/api/health");
  if (health.timezone !== "Asia/Jakarta" || health.displayTimezone !== "WIB") {
    throw new Error("Health response does not report WIB configuration.");
  }

  await request("/api/reminders", { headers: { Authorization: "" } }, 401);

  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(scheduledAt);
  const parts = Object.fromEntries(localParts.map((part) => [part.type, part.value]));

  const payload = {
    groupId: "120363000000000000@g.us",
    groupName: "[TEST GROUP]",
    message: "[TEST] API lifecycle check.",
    scheduleType: "weekday",
    scheduledAt: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`,
    timezone: "Asia/Jakarta",
    maxRetries: 3
  };

  const created = await request("/api/reminders", { method: "POST", body: JSON.stringify(payload) }, 201);
  reminderId = created.reminder.id;
  if (created.reminder.status !== "scheduled") throw new Error("Created reminder is not scheduled.");
  if (created.reminder.scheduleType !== "weekday") throw new Error("Weekday schedule was not stored.");

  const paused = await request(`/api/reminders/${reminderId}/pause`, { method: "POST" });
  if (paused.reminder.status !== "paused") throw new Error("Reminder did not pause.");

  const resumed = await request(`/api/reminders/${reminderId}/resume`, { method: "POST" });
  if (resumed.reminder.status !== "scheduled") throw new Error("Reminder did not resume.");

  const deliveries = await request(`/api/reminders/${reminderId}/deliveries`);
  if (deliveries.deliveries.length !== 0) throw new Error("New reminder has unexpected delivery records.");

  const cancelled = await request(`/api/reminders/${reminderId}`, { method: "DELETE" });
  if (cancelled.reminder.status !== "cancelled") throw new Error("Reminder did not cancel.");

  console.log("Smoke test passed: health, auth, weekday create, pause, resume, history, and cancel.");
} finally {
  if (reminderId) {
    await pool.execute("DELETE FROM reminders WHERE id = ?", [reminderId]);
  }
  await pool.end();
}
