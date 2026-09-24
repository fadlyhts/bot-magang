function normalizeMessageItem(item) {
  if (typeof item === "string" && item.length) {
    return { type: "text", text: item };
  }

  if (item?.type === "text" && typeof item.text === "string" && item.text.length) {
    return { type: "text", text: item.text };
  }

  if (item?.type === "poll" && typeof item.question === "string" && Array.isArray(item.options)) {
    return {
      type: "poll",
      question: item.question,
      options: item.options.filter((option) => typeof option === "string" && option.length),
      multipleAnswers: Boolean(item.multipleAnswers)
    };
  }

  return null;
}

export function parseStoredMessageItems(value, fallback = "") {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }

  if (Array.isArray(parsed)) {
    const items = parsed.map(normalizeMessageItem).filter(Boolean);
    if (items.length) return items;
  }

  return fallback ? [{ type: "text", text: fallback }] : [];
}

export function messageItemSummary(item) {
  return item.type === "poll" ? item.question : item.text;
}
