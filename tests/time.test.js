import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { localDateTimeToUtc, nextOccurrence, utcSqlToIso } from "../src/lib/time.js";

describe("WIB schedule conversion", () => {
  it("stores a Jakarta local time as UTC", () => {
    expect(localDateTimeToUtc("2026-09-23T09:30", "Asia/Jakarta")).toBe("2026-09-23 02:30:00.000");
  });

  it("returns an ISO value with the UTC offset", () => {
    expect(utcSqlToIso("2026-09-23 02:30:00.000")).toBe("2026-09-23T02:30:00.000Z");
  });

  it("keeps the same WIB time for a daily reminder", () => {
    const now = DateTime.fromISO("2026-09-23T03:00:00Z");
    expect(nextOccurrence("2026-09-23 02:30:00.000", "daily", "Asia/Jakarta", now)).toBe("2026-09-24 02:30:00.000");
  });

  it("moves a weekday reminder from Friday to Monday in WIB", () => {
    const now = DateTime.fromISO("2026-09-25T03:00:00Z");
    expect(nextOccurrence("2026-09-25 02:30:00.000", "weekday", "Asia/Jakarta", now)).toBe("2026-09-28 02:30:00.000");
  });

  it("skips a missed weekend and weekday occurrence after downtime", () => {
    const now = DateTime.fromISO("2026-09-29T03:00:00Z");
    expect(nextOccurrence("2026-09-25 02:30:00.000", "weekday", "Asia/Jakarta", now)).toBe("2026-09-30 02:30:00.000");
  });

  it("skips missed weekly occurrences after downtime", () => {
    const now = DateTime.fromISO("2026-10-15T00:00:00Z");
    expect(nextOccurrence("2026-09-23 02:30:00.000", "weekly", "Asia/Jakarta", now)).toBe("2026-10-21 02:30:00.000");
  });
});
