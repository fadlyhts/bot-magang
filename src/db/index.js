import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../config.js";
import { logger } from "../logger.js";

export const pool = mysql.createPool({
  ...config.mysql,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
  dateStrings: true,
  charset: "utf8mb4"
});

export async function migrate() {
  const path = fileURLToPath(new URL("./migration.sql", import.meta.url));
  const migration = await readFile(path, "utf8");
  const statements = migration
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  const connection = await pool.getConnection();
  try {
    for (const statement of statements) {
      await connection.query(statement);
    }

    const [messageColumns] = await connection.execute(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reminders' AND COLUMN_NAME = 'messages'`
    );
    if (!Number(messageColumns[0].count)) {
      await connection.query("ALTER TABLE reminders ADD COLUMN messages JSON NULL AFTER message");
    }

    const [customScheduleColumns] = await connection.execute(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reminders' AND COLUMN_NAME = 'custom_schedule'`
    );
    if (!Number(customScheduleColumns[0].count)) {
      await connection.query("ALTER TABLE reminders ADD COLUMN custom_schedule JSON NULL AFTER schedule_type");
    }

    const [deliveryColumns] = await connection.execute(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reminder_deliveries' AND COLUMN_NAME = 'message_index'`
    );
    if (!Number(deliveryColumns[0].count)) {
      await connection.query("ALTER TABLE reminder_deliveries ADD COLUMN message_index SMALLINT UNSIGNED NULL AFTER delivery_type");
    }

    await connection.query("UPDATE reminders SET messages = JSON_ARRAY(message) WHERE messages IS NULL OR JSON_LENGTH(messages) = 0");
    logger.info("Database migration completed");
  } finally {
    connection.release();
  }
}

export async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
