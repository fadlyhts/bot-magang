export function parseStoredMessages(value, fallback = "") {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }

  if (Array.isArray(parsed)) {
    const messages = parsed.filter((message) => typeof message === "string" && message.length);
    if (messages.length) return messages;
  }

  return fallback ? [fallback] : [];
}
