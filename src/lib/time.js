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

export function parseCustomSchedule(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }

  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((day) => Number.isInteger(Number(day?.weekday)) && Array.isArray(day?.times))
    .map((day) => ({
      weekday: Number(day.weekday),
      times: [...new Set(day.times.filter((time) => /^\d{2}:\d{2}$/.test(time)))].sort()
    }))
    .filter((day) => day.weekday >= 1 && day.weekday <= 7 && day.times.length)
    .sort((a, b) => a.weekday - b.weekday);
}

function findCustomOccurrence(schedule, timezone, threshold) {
  const localThreshold = threshold.setZone(timezone);
  const byWeekday = new Map(schedule.map((day) => [day.weekday, day.times]));

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const date = localThreshold.startOf("day").plus({ days: dayOffset });
    for (const time of byWeekday.get(date.weekday) || []) {
      const [hour, minute] = time.split(":").map(Number);
      const candidate = date.set({ hour, minute, second: 0, millisecond: 0 });
      if (candidate > localThreshold) return candidate.toUTC().toFormat(mysqlFormat);
    }
  }

  throw new AppError(400, "Add at least one valid custom day and time.");
}

export function firstCustomOccurrence(customSchedule, timezone, startDate, now = DateTime.utc()) {
  if (!IANAZone.isValidZone(timezone)) throw new AppError(400, "The selected timezone is invalid.");
  const schedule = parseCustomSchedule(customSchedule);
  const start = DateTime.fromISO(startDate, { zone: timezone }).startOf("day");
  if (!start.isValid) throw new AppError(400, "Enter a valid start date.");
  const threshold = DateTime.max(now.setZone(timezone), start.minus({ milliseconds: 1 }));
  return findCustomOccurrence(schedule, timezone, threshold);
}

export function nextCustomOccurrence(currentUtc, customSchedule, timezone, now = DateTime.utc()) {
  if (!IANAZone.isValidZone(timezone)) throw new AppError(400, "The selected timezone is invalid.");
  const schedule = parseCustomSchedule(customSchedule);
  const current = DateTime.fromSQL(currentUtc, { zone: "utc" });
  if (!current.isValid) throw new AppError(400, "The current schedule time is invalid.");
  return findCustomOccurrence(schedule, timezone, DateTime.max(current, now));
}

export function formatLocalSql(localDateTime, timezone) {
  return DateTime.fromISO(localDateTime, { zone: timezone }).toFormat(mysqlFormat);
}
