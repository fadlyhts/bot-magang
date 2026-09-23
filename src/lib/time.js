import { DateTime, IANAZone } from "luxon";
import { AppError } from "./errors.js";

const mysqlFormat = "yyyy-MM-dd HH:mm:ss.SSS";

export function localDateTimeToUtc(localDateTime, timezone) {
  if (!IANAZone.isValidZone(timezone)) {
    throw new AppError(400, "The selected timezone is invalid.");
  }

  const parsed = DateTime.fromISO(localDateTime, { zone: timezone });
  if (!parsed.isValid) {
    throw new AppError(400, "Enter a valid date and time.");
  }

  return parsed.toUTC().toFormat(mysqlFormat);
}

export function utcSqlToIso(value) {
  if (!value) return null;
  return DateTime.fromSQL(value, { zone: "utc" }).toISO();
}

export function sqlNow() {
  return DateTime.utc().toFormat(mysqlFormat);
}

export function nextOccurrence(currentUtc, scheduleType, timezone, now = DateTime.utc()) {
  let next = DateTime.fromSQL(currentUtc, { zone: "utc" }).setZone(timezone);
  const increment = scheduleType === "weekly" ? { weeks: 1 } : { days: 1 };

  do {
    next = next.plus(increment);
  } while (next.toUTC() <= now || (scheduleType === "weekday" && next.weekday > 5));

  return next.toUTC().toFormat(mysqlFormat);
}

export function formatLocalSql(localDateTime, timezone) {
  return DateTime.fromISO(localDateTime, { zone: timezone }).toFormat(mysqlFormat);
}
