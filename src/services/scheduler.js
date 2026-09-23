import { randomUUID } from "node:crypto";
import cron from "node-cron";
import { config } from "../config.js";
import { pool, withTransaction } from "../db/index.js";
import { nextOccurrence } from "../lib/time.js";
import { logger } from "../logger.js";
import { sendText } from "./waha.js";

let running = false;
let task;

async function recoverStaleClaims(connection) {
  await connection.execute(
    `UPDATE reminders
     SET status = 'retrying', lock_token = NULL, locked_at = NULL,
         next_attempt_at = UTC_TIMESTAMP(3), last_error = 'Recovered after an interrupted send attempt.'
     WHERE status = 'processing'
       AND locked_at < UTC_TIMESTAMP(3) - INTERVAL ? MINUTE`,
    [config.schedulerLockTimeoutMinutes]
  );
}

export async function claimDueReminders() {
  const token = randomUUID();
  const limit = Number(config.schedulerBatchSize);

  const ids = await withTransaction(async (connection) => {
    await recoverStaleClaims(connection);
    const [rows] = await connection.query(
      `SELECT id
       FROM reminders
       WHERE status IN ('scheduled', 'retrying')
         AND next_attempt_at IS NOT NULL
         AND next_attempt_at <= UTC_TIMESTAMP(3)
       ORDER BY next_attempt_at ASC
       LIMIT ${limit}
       FOR UPDATE SKIP LOCKED`
    );

    if (!rows.length) return [];
    const claimedIds = rows.map((row) => row.id);
    const placeholders = claimedIds.map(() => "?").join(", ");
    await connection.query(
      `UPDATE reminders
       SET status = 'processing', lock_token = ?, locked_at = UTC_TIMESTAMP(3)
       WHERE id IN (${placeholders})`,
      [token, ...claimedIds]
    );
    return claimedIds;
  });

  if (!ids.length) return [];
  const [rows] = await pool.query("SELECT * FROM reminders WHERE lock_token = ? ORDER BY next_attempt_at ASC", [token]);
  return rows;
}

function backoffSeconds(retryCount) {
  return Math.min(30 * 2 ** Math.max(retryCount - 1, 0), 15 * 60);
}

async function recordSuccess(reminder, response) {
  const messageId = response?.id || response?.key?.id || response?.messageId || null;
  const nextRunAt = reminder.schedule_type === "one_time"
    ? null
    : nextOccurrence(reminder.next_run_at, reminder.schedule_type, reminder.timezone);

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO reminder_deliveries
        (reminder_id, delivery_type, scheduled_for, sent_at, attempt_number, status, waha_message_id, waha_response)
       VALUES (?, 'scheduled', ?, UTC_TIMESTAMP(3), ?, 'sent', ?, ?)`,
      [reminder.id, reminder.next_run_at, reminder.retry_count + 1, messageId, JSON.stringify(response ?? null)]
    );

    if (reminder.schedule_type === "one_time") {
      await connection.execute(
        `UPDATE reminders
         SET status = 'sent', last_sent_at = UTC_TIMESTAMP(3), next_run_at = NULL, next_attempt_at = NULL,
             retry_count = 0, last_error = NULL, lock_token = NULL, locked_at = NULL
         WHERE id = ? AND lock_token = ?`,
        [reminder.id, reminder.lock_token]
      );
    } else {
      await connection.execute(
        `UPDATE reminders
         SET status = 'scheduled', last_sent_at = UTC_TIMESTAMP(3), next_run_at = ?, next_attempt_at = ?,
             retry_count = 0, last_error = NULL, lock_token = NULL, locked_at = NULL
         WHERE id = ? AND lock_token = ?`,
        [nextRunAt, nextRunAt, reminder.id, reminder.lock_token]
      );
    }
  });

  logger.info({ reminderId: reminder.id, groupId: reminder.group_id, messageId }, "Reminder sent");
}

async function recordFailure(reminder, error) {
  const retryCount = reminder.retry_count + 1;
  const willRetry = retryCount <= reminder.max_retries;
  const delaySeconds = backoffSeconds(retryCount);
  const errorMessage = String(error.message || "Unknown delivery error").slice(0, 4000);

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO reminder_deliveries
        (reminder_id, delivery_type, scheduled_for, attempt_number, status, error_message)
       VALUES (?, 'scheduled', ?, ?, 'failed', ?)`,
      [reminder.id, reminder.next_run_at, retryCount, errorMessage]
    );

    if (willRetry) {
      await connection.execute(
        `UPDATE reminders
         SET status = 'retrying', retry_count = ?, last_error = ?,
             next_attempt_at = UTC_TIMESTAMP(3) + INTERVAL ? SECOND, lock_token = NULL, locked_at = NULL
         WHERE id = ? AND lock_token = ?`,
        [retryCount, errorMessage, delaySeconds, reminder.id, reminder.lock_token]
      );
    } else {
      await connection.execute(
        `UPDATE reminders
         SET status = 'failed', retry_count = ?, last_error = ?, next_attempt_at = NULL,
             lock_token = NULL, locked_at = NULL
         WHERE id = ? AND lock_token = ?`,
        [retryCount, errorMessage, reminder.id, reminder.lock_token]
      );
    }
  });

  logger.warn({ reminderId: reminder.id, retryCount, willRetry, err: error }, "Reminder delivery failed");
}

export async function processReminder(reminder) {
  try {
    const response = await sendText({ groupId: reminder.group_id, message: reminder.message });
    await recordSuccess(reminder, response);
  } catch (error) {
    await recordFailure(reminder, error);
  }
}

export async function runSchedulerTick() {
  if (running) return;
  running = true;
  try {
    const reminders = await claimDueReminders();
    await Promise.all(reminders.map(processReminder));
  } catch (error) {
    logger.error({ err: error }, "Scheduler tick failed");
  } finally {
    running = false;
  }
}

export function startScheduler() {
  const expression = `*/${config.schedulerIntervalSeconds} * * * * *`;
  task = cron.schedule(expression, runSchedulerTick, { timezone: "UTC" });
  void runSchedulerTick();
  logger.info({ intervalSeconds: config.schedulerIntervalSeconds }, "Reminder scheduler started");
}

export function stopScheduler() {
  task?.stop();
  task = undefined;
}

