import { describe, expect, it } from "vitest";
import { reminderInputSchema } from "../src/services/reminders.js";

const valid = {
  groupId: "120363000000000000@g.us",
  groupName: "Operations",
  message: "Daily stand-up starts in 10 minutes.",
  scheduleType: "daily",
  scheduledAt: "2027-01-01T09:00",
  timezone: "Asia/Jakarta",
  maxRetries: 3
};

describe("reminder input", () => {
  it("accepts a WhatsApp group reminder", () => {
    expect(reminderInputSchema.parse(valid)).toMatchObject(valid);
  });

  it("accepts a weekday reminder", () => {
    expect(reminderInputSchema.parse({ ...valid, scheduleType: "weekday" }).scheduleType).toBe("weekday");
  });

  it("rejects a direct-message chat id", () => {
    expect(() => reminderInputSchema.parse({ ...valid, groupId: "628123456789@c.us" })).toThrow();
  });

  it("rejects an empty message", () => {
    expect(() => reminderInputSchema.parse({ ...valid, message: "   " })).toThrow();
  });
});
