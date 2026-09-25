CREATE TABLE IF NOT EXISTS reminders (
  id CHAR(36) PRIMARY KEY,
  group_id VARCHAR(128) NOT NULL,
  group_name VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  messages JSON NULL,
  schedule_type ENUM('one_time', 'daily', 'weekday', 'weekly', 'custom_weekly') NOT NULL,
  custom_schedule JSON NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
  scheduled_local DATETIME(3) NOT NULL,
  next_run_at DATETIME(3) NULL,
  next_attempt_at DATETIME(3) NULL,
  status ENUM('scheduled', 'processing', 'retrying', 'paused', 'sent', 'failed', 'cancelled') NOT NULL DEFAULT 'scheduled',
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  max_retries TINYINT UNSIGNED NOT NULL DEFAULT 3,
  last_sent_at DATETIME(3) NULL,
  last_error TEXT NULL,
  lock_token CHAR(36) NULL,
  locked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_reminders_due (status, next_attempt_at),
  INDEX idx_reminders_lock (lock_token),
  INDEX idx_reminders_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE reminders
  MODIFY COLUMN schedule_type ENUM('one_time', 'daily', 'weekday', 'weekly', 'custom_weekly') NOT NULL;

CREATE TABLE IF NOT EXISTS reminder_deliveries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reminder_id CHAR(36) NOT NULL,
  delivery_type ENUM('scheduled', 'manual') NOT NULL,
  message_index SMALLINT UNSIGNED NULL,
  scheduled_for DATETIME(3) NULL,
  attempted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  attempt_number INT UNSIGNED NOT NULL,
  status ENUM('sent', 'failed') NOT NULL,
  waha_message_id VARCHAR(255) NULL,
  waha_response JSON NULL,
  error_message TEXT NULL,
  CONSTRAINT fk_deliveries_reminder FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE,
  INDEX idx_deliveries_reminder (reminder_id, attempted_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
