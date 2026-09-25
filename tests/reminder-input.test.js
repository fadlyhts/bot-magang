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

  it("accepts different times for each custom weekday", () => {
    const result = reminderInputSchema.parse({
      ...valid,
      scheduleType: "custom_weekly",
      scheduledAt: "2027-01-01",
      customSchedule: [
        { weekday: 1, times: ["08:00", "17:00"] },
        { weekday: 5, times: ["08:00", "13:00"] }
      ]
    });
    expect(result.customSchedule).toEqual([
      { weekday: 1, times: ["08:00", "17:00"] },
      { weekday: 5, times: ["08:00", "13:00"] }
    ]);
  });

  it("requires a day for a custom schedule", () => {
    expect(() => reminderInputSchema.parse({
      ...valid,
      scheduleType: "custom_weekly",
      scheduledAt: "2027-01-01",
      customSchedule: []
    })).toThrow();
  });

  it("accepts up to ten custom messages", () => {
    const result = reminderInputSchema.parse({
      ...valid,
      message: undefined,
      messages: ["First custom message.", "Second custom message.", "Third custom message."]
    });
    expect(result.messages).toEqual(["First custom message.", "Second custom message.", "Third custom message."]);
  });

  it("accepts text and voting in one reminder", () => {
    const result = reminderInputSchema.parse({
      ...valid,
      message: undefined,
      messageItems: [
        { type: "text", text: "Please vote before noon." },
        {
          type: "poll",
          question: "Which lunch menu should we order?",
          options: ["Nasi goreng", "Soto ayam", "Gado-gado"],
          multipleAnswers: false
        }
      ]
    });
    expect(result.messageItems[1]).toMatchObject({ type: "poll", options: ["Nasi goreng", "Soto ayam", "Gado-gado"] });
  });

  it("rejects duplicate voting options", () => {
    expect(() => reminderInputSchema.parse({
      ...valid,
      message: undefined,
      messageItems: [{
        type: "poll",
        question: "Choose one",
        options: ["Yes", "yes"],
        multipleAnswers: false
      }]
    })).toThrow();
  });

  it("rejects more than ten messages", () => {
    expect(() => reminderInputSchema.parse({ ...valid, message: undefined, messages: Array(11).fill("Message") })).toThrow();
  });

  it("rejects a direct-message chat id", () => {
    expect(() => reminderInputSchema.parse({ ...valid, groupId: "628123456789@c.us" })).toThrow();
  });

  it("rejects an empty message", () => {
    expect(() => reminderInputSchema.parse({ ...valid, message: "   " })).toThrow();
  });
});
