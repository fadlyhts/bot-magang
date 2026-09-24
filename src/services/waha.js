import { config } from "../config.js";
import { WahaError } from "../lib/errors.js";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${config.waha.url}${path}`, {
      ...options,
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": config.waha.apiKey,
        ...options.headers
      }
    });
  } catch (error) {
    throw new WahaError("WAHA is unavailable.", 503, error.message);
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new WahaError("WAHA rejected the request.", response.status, body);
  }

  return body;
}

export async function getSession() {
  return request(`/api/sessions/${encodeURIComponent(config.waha.session)}`);
}

export function normalizeGroupsPage(page) {
  const source = page?.data ?? page;
  if (Array.isArray(source)) return source;
  if (source && typeof source === "object") return Object.values(source);
  return [];
}

export async function listGroups() {
  const groups = [];
  const limit = 100;

  for (let offset = 0; ; offset += limit) {
    const page = await request(
      `/api/${encodeURIComponent(config.waha.session)}/groups?limit=${limit}&offset=${offset}&sortBy=subject&sortOrder=asc&exclude=participants`
    );
    const items = normalizeGroupsPage(page);
    groups.push(...items);
    if (items.length < limit) break;
  }

  return groups
    .map((group) => ({
      id: group.id || group.groupId,
      name: group.subject || group.name || group.id || group.groupId
    }))
    .filter((group) => group.id?.endsWith("@g.us"));
}

export async function sendText({ groupId, message }) {
  return request("/api/sendText", {
    method: "POST",
    body: JSON.stringify({
      session: config.waha.session,
      chatId: groupId,
      text: message
    })
  });
}

export async function sendPoll({ groupId, question, options, multipleAnswers }) {
  return request("/api/sendPoll", {
    method: "POST",
    body: JSON.stringify({
      session: config.waha.session,
      chatId: groupId,
      poll: {
        name: question,
        options,
        multipleAnswers
      }
    })
  });
}

export function sendMessageItem({ groupId, item }) {
  if (item.type === "poll") {
    return sendPoll({
      groupId,
      question: item.question,
      options: item.options,
      multipleAnswers: item.multipleAnswers
    });
  }
  return sendText({ groupId, message: item.text });
}
