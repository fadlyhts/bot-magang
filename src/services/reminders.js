import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/index.js";
import { AppError } from "../lib/errors.js";
import { formatLocalSql, localDateTimeToUtc, sqlNow, utcSqlToIso } from "../lib/time.js";
import { sendText } from "./waha.js";

export const reminderInputSchema = z.object({
  groupId: z.string().min(1).max(128).refine((value) => value.endsWith("@g.us"), "Select a WhatsApp group."),
  groupName: z.string().min(1).max(255),
  message: z.string().trim().min(1).max(4096),
  scheduleType: z.enum(["one_time", "daily", "weekday", "weekly"]),
  scheduledAt: z.string().min(1),
  timezone: z.string().default(config.timezone),
  maxRetries: z.coerce.number().int().min(0).max(10).default(3)
});

function serializeReminder(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    message: row.message,
    scheduleType: row.schedule_type,
    timezone: row.timezone,
    scheduledLocal: row.scheduled_local?.replace(" ", "T").replace(/\.000$/, ""),
    nextRunAt: utcSqlToIso(row.next_run_at),
    nextAttemptAt: utcSqlToIso(row.next_attempt_at),
    status: row.status,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    lastSentAt: utcSqlToIso(row.last_sent_at),
    lastError: row.last_error,
    createdAt: utcSqlToIso(row.created_at),
    updatedAt: utcSqlToIso(row.updated_at)
  };
}

function serializeDelivery(row) {
  return {
    id: row.id,
    reminderId: row.reminder_id,
    deliveryType: row.delivery_type,
    scheduledFor: utcSqlToIso(row.scheduled_for),
    attemptedAt: utcSqlToIso(row.attempted_at),
    sentAt: utcSqlToIso(row.sent_at),
    attemptNumber: row.attempt_number,
    status: row.status,
    wahaMessageId: row.waha_message_id,
    errorMessage: row.error_message
  };
}

function scheduleValues(input, allowPast = false) {
  const nextRunAt = localDateTimeToUtc(input.scheduledAt, input.timezone);
  const parsed = DateTime.fromSQL(nextRunAt, { zone: "utc" });
  if (!allowPast && parsed <= DateTime.utc().minus({ seconds: 5 })) {
    throw new AppError(400, "Choose a future date and time.");
  }

  return {
    scheduledLocal: formatLocalSql(input.scheduledAt, input.timezone),
    nextRunAt
  };
}

export async function listReminders(status) {
  const values = [];
  let where = "";
  if (status) {
    where = "WHERE status = ?";
    values.push(status);
  }
  const [rows] = await pool.query(
    `SELECT * FROM reminders ${where} ORDER BY COALESCE(next_run_at, created_at) ASC, created_at DESC`,
    values
  );
  return rows.map(serializeReminder);
}

export async function getReminder(id) {
  const [rows] = await pool.query("SELECT * FROM reminders WHERE id = ?", [id]);
  if (!rows.length) throw new AppError(404, "Reminder not found.");
  return rows[0];
}

export async function createReminder(payload) {
  const input = reminderInputSchema.parse(payload);
  const { scheduledLocal, nextRunAt } = scheduleValues(input);
  const id = randomUUID();

  await pool.execute(
    `INSERT INTO reminders
      (id, group_id, group_name, message, schedule_type, timezone, scheduled_local, next_run_at, next_attempt_at, max_retries)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.groupId, input.groupName, input.message, input.scheduleType, input.timezone, scheduledLocal, nextRunAt, nextRunAt, input.maxRetries]
  );

  return serializeReminder(await getReminder(id));
}

export async function updateReminder(id, payload) {
  const input = reminderInputSchema.parse(payload);
  const existing = await getReminder(id);
  if (existing.status === "processing") {
    throw new AppError(409, "This reminder is being sent and cannot be edited.");
  }
  const { scheduledLocal, nextRunAt } = scheduleValues(input);

  await pool.execute(
    `UPDATE reminders SET
      group_id = ?, group_name = ?, message = ?, schedule_type = ?, timezone = ?, scheduled_local = ?,
      next_run_at = ?, next_attempt_at = ?, status = 'scheduled', retry_count = 0, last_error = NULL,
      lock_token = NULL, locked_at = NULL
     WHERE id = ?`,
    [input.groupId, input.groupName, input.message, input.scheduleType, input.timezone, scheduledLocal, nextRunAt, nextRunAt, id]
  );

  return serializeReminder(await getReminder(id));
}

export async function cancelReminder(id) {
  const existing = await getReminder(id);
  if (existing.status === "processing") {
    throw new AppError(409, "This reminder is being sent and cannot be cancelled.");
  }
  await pool.execute(
    "UPDATE reminders SET status = 'cancelled', next_attempt_at = NULL, lock_token = NULL, locked_at = NULL WHERE id = ?",
    [id]
  );
  return serializeReminder(await getReminder(id));
}

export async function pauseReminder(id) {
  const existing = await getReminder(id);
  if (!["scheduled", "retrying"].includes(existing.status)) {
    throw new AppError(409, "Only a scheduled reminder can be paused.");
  }
  await pool.execute("UPDATE reminders SET status = 'paused', next_attempt_at = NULL WHERE id = ?", [id]);
  return serializeReminder(await getReminder(id));
}

export async function resumeReminder(id) {
  const existing = await getReminder(id);
  if (!["paused", "failed"].includes(existing.status)) {
    throw new AppError(409, "Only a paused or failed reminder can be resumed.");
  }
  const nextAttemptAt = DateTime.fromSQL(existing.next_run_at, { zone: "utc" }) > DateTime.utc() ? existing.next_run_at : sqlNow();
  await pool.execute(
    "UPDATE reminders SET status = 'scheduled', next_attempt_at = ?, retry_count = 0, last_error = NULL WHERE id = ?",
    [nextAttemptAt, id]
  );
  return serializeReminder(await getReminder(id));
}

export async function listDeliveries(id) {
  await getReminder(id);
  const [rows] = await pool.query(
    "SELECT * FROM reminder_deliveries WHERE reminder_id = ? ORDER BY attempted_at DESC LIMIT 100",
    [id]
  );
  return rows.map(serializeDelivery);
}

export async function sendReminderNow(id) {
  const reminder = await getReminder(id);
  const [countRows] = await pool.query("SELECT COUNT(*) AS count FROM reminder_deliveries WHERE reminder_id = ? AND delivery_type = 'manual'", [id]);
  const attemptNumber = Number(countRows[0].count) + 1;

  try {
    const response = await sendText({ groupId: reminder.group_id, message: reminder.message });
    const messageId = response?.id || response?.key?.id || response?.messageId || null;
    await pool.execute(
      `INSERT INTO reminder_deliveries
        (reminder_id, delivery_type, scheduled_for, sent_at, attempt_number, status, waha_message_id, waha_response)
       VALUES (?, 'manual', NULL, UTC_TIMESTAMP(3), ?, 'sent', ?, ?)`,
      [id, attemptNumber, messageId, JSON.stringify(response ?? null)]
    );
    return { status: "sent", messageId };
  } catch (error) {
    await pool.execute(
      `INSERT INTO reminder_deliveries
        (reminder_id, delivery_type, scheduled_for, attempt_number, status, error_message)
       VALUES (?, 'manual', NULL, ?, 'failed', ?)`,
      [id, attemptNumber, error.message]
    );
    throw error;
  }
}
