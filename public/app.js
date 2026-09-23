const WIB_TIMEZONE = "Asia/Jakarta";

const elements = {
  sessionState: document.querySelector("#session-state"),
  sessionLabel: document.querySelector("#session-label"),
  themeToggle: document.querySelector("#theme-toggle"),
  filter: document.querySelector("#status-filter"),
  refreshReminders: document.querySelector("#refresh-reminders"),
  reminderState: document.querySelector("#reminder-state"),
  reminderList: document.querySelector("#reminder-list"),
  form: document.querySelector("#reminder-form"),
  formTitle: document.querySelector("#form-title"),
  cancelEdit: document.querySelector("#cancel-edit"),
  groupSelect: document.querySelector("#group-id"),
  groupHelp: document.querySelector("#group-help"),
  refreshGroups: document.querySelector("#refresh-groups"),
  scheduledAt: document.querySelector("#scheduled-at"),
  message: document.querySelector("#message"),
  messageCount: document.querySelector("#message-count"),
  maxRetries: document.querySelector("#max-retries"),
  formError: document.querySelector("#form-error"),
  submit: document.querySelector("#submit-reminder"),
  deliveryDialog: document.querySelector("#delivery-dialog"),
  closeDelivery: document.querySelector("#close-delivery"),
  deliveryContent: document.querySelector("#delivery-content"),
  toastRegion: document.querySelector("#toast-region")
};

const state = {
  reminders: [],
  groups: [],
  editingId: null
};

const statusLabels = {
  scheduled: "Scheduled",
  processing: "Sending",
  retrying: "Retrying",
  paused: "Paused",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled"
};

const repeatLabels = {
  one_time: "One time",
  daily: "Daily",
  weekday: "Weekdays",
  weekly: "Weekly"
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "The request failed.");
    error.fields = body.fields;
    throw error;
  }
  return body;
}

function wibInputValue(date = new Date(Date.now() + 5 * 60_000)) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function wibParts(isoValue) {
  if (!isoValue) return { day: "No next run", time: "", zone: "" };
  const date = new Date(isoValue);
  return {
    day: new Intl.DateTimeFormat("en-ID", {
      timeZone: WIB_TIMEZONE,
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date),
    time: new Intl.DateTimeFormat("en-ID", {
      timeZone: WIB_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date),
    zone: "WIB"
  };
}

function fullWibDate(isoValue) {
  if (!isoValue) return "Not recorded";
  return `${new Intl.DateTimeFormat("en-ID", {
    timeZone: WIB_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(isoValue))} WIB`;
}

function button(label, action, reminderId, tone) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "row-button";
  item.textContent = label;
  item.dataset.action = action;
  item.dataset.id = reminderId;
  if (tone) item.dataset.tone = tone;
  return item;
}

function setDataState(kind, message, actionLabel) {
  elements.reminderState.replaceChildren();
  elements.reminderState.dataset.kind = kind;

  const copy = document.createElement("span");
  copy.textContent = message;
  elements.reminderState.append(copy);

  if (actionLabel) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "quiet-button";
    action.textContent = actionLabel;
    action.addEventListener("click", loadReminders, { once: true });
    elements.reminderState.append(action);
  }

  elements.reminderState.hidden = false;
}

function matchesFilter(reminder) {
  switch (elements.filter.value) {
    case "active":
      return ["scheduled", "processing", "retrying", "paused"].includes(reminder.status);
    case "attention":
      return ["retrying", "failed", "paused"].includes(reminder.status);
    case "complete":
      return ["sent", "cancelled"].includes(reminder.status);
    default:
      return true;
  }
}

function renderReminder(reminder) {
  const li = document.createElement("li");
  li.className = "reminder-item";
  li.dataset.id = reminder.id;

  const timeData = wibParts(reminder.nextRunAt || reminder.lastSentAt);
  const timeBlock = document.createElement("div");
  timeBlock.className = "time-block";

  const time = document.createElement("time");
  if (reminder.nextRunAt) time.dateTime = reminder.nextRunAt;
  const day = document.createElement("span");
  day.className = "time-day";
  day.textContent = timeData.day;
  const clock = document.createElement("span");
  clock.className = "time-clock";
  clock.textContent = timeData.time;
  const zone = document.createElement("span");
  zone.className = "time-zone";
  zone.textContent = timeData.zone;
  time.append(day, clock, zone);
  timeBlock.append(time);

  const body = document.createElement("div");
  body.className = "reminder-body";

  const titleRow = document.createElement("div");
  titleRow.className = "reminder-title-row";
  const title = document.createElement("h3");
  title.className = "reminder-group";
  title.textContent = reminder.groupName;
  const status = document.createElement("span");
  status.className = "status-label";
  status.dataset.status = reminder.status;
  status.textContent = statusLabels[reminder.status] || reminder.status;
  titleRow.append(title, status);

  const message = document.createElement("p");
  message.className = "reminder-message";
  message.textContent = reminder.message;

  const meta = document.createElement("div");
  meta.className = "reminder-meta";
  const repeat = document.createElement("span");
  repeat.textContent = repeatLabels[reminder.scheduleType] || reminder.scheduleType;
  const attempts = document.createElement("span");
  attempts.textContent = reminder.retryCount ? `${reminder.retryCount} failed attempt${reminder.retryCount === 1 ? "" : "s"}` : "No failed attempts";
  meta.append(repeat, attempts);

  body.append(titleRow, message, meta);

  if (reminder.lastError) {
    const error = document.createElement("p");
    error.className = "reminder-error";
    error.textContent = reminder.lastError;
    body.append(error);
  }

  const actions = document.createElement("div");
  actions.className = "reminder-actions";
  actions.append(button("History", "history", reminder.id));

  if (!["processing", "cancelled"].includes(reminder.status)) {
    actions.append(button("Send now", "send", reminder.id));
  }
  if (["scheduled", "retrying"].includes(reminder.status)) {
    actions.append(button("Edit", "edit", reminder.id));
    actions.append(button("Pause", "pause", reminder.id));
  }
  if (["paused", "failed"].includes(reminder.status)) {
    actions.append(button("Resume", "resume", reminder.id));
    actions.append(button("Edit", "edit", reminder.id));
  }
  if (!["processing", "cancelled", "sent"].includes(reminder.status)) {
    actions.append(button("Cancel", "cancel", reminder.id, "danger"));
  }

  body.append(actions);
  li.append(timeBlock, body);
  return li;
}

function renderReminders() {
  const visible = state.reminders.filter(matchesFilter);
  elements.reminderList.replaceChildren(...visible.map(renderReminder));

  if (visible.length) {
    elements.reminderState.hidden = true;
    return;
  }

  const messages = {
    active: "No active reminders. Use the form to schedule the first message.",
    attention: "No reminders need attention.",
    complete: "No reminders have been sent or cancelled yet.",
    all: "No reminders exist yet. Use the form to schedule one."
  };
  setDataState("empty", messages[elements.filter.value]);
}

async function loadReminders() {
  setDataState("loading", "Loading reminders");
  elements.refreshReminders.disabled = true;
  try {
    const response = await api("/api/reminders");
    state.reminders = response.reminders;
    renderReminders();
  } catch (error) {
    setDataState("error", `${error.message} Check the server and try again.`, "Retry loading");
  } finally {
    elements.refreshReminders.disabled = false;
  }
}

async function loadSession() {
  elements.sessionState.dataset.status = "loading";
  elements.sessionLabel.textContent = "Checking WhatsApp";
  try {
    const session = await api("/api/waha/session");
    const working = session.status === "WORKING";
    elements.sessionState.dataset.status = working ? "working" : "error";
    elements.sessionLabel.textContent = working
      ? `WhatsApp connected${session.account ? ` as ${session.account}` : ""}`
      : `WhatsApp ${String(session.status || "not connected").toLowerCase()}`;
  } catch {
    elements.sessionState.dataset.status = "error";
    elements.sessionLabel.textContent = "WAHA unavailable";
  }
}

function renderGroupOptions() {
  const previousValue = elements.groupSelect.value;
  elements.groupSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = state.groups.length ? "Select a group" : "No groups found";
  elements.groupSelect.append(placeholder);

  for (const group of state.groups) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    option.dataset.groupName = group.name;
    elements.groupSelect.append(option);
  }

  if (state.groups.some((group) => group.id === previousValue)) {
    elements.groupSelect.value = previousValue;
  }
  elements.groupSelect.disabled = !state.groups.length;
}

async function loadGroups() {
  elements.refreshGroups.disabled = true;
  elements.groupSelect.disabled = true;
  elements.groupHelp.textContent = "Loading groups from WAHA.";
  try {
    const response = await api("/api/waha/groups");
    state.groups = response.groups;
    renderGroupOptions();
    elements.groupHelp.textContent = state.groups.length
      ? "The connected number must already be a member."
      : "No groups were returned. Join a group with the connected WhatsApp number, then reload.";
  } catch (error) {
    state.groups = [];
    renderGroupOptions();
    elements.groupHelp.textContent = `${error.message} Connect the session in the WAHA dashboard on port 3000, then reload.`;
  } finally {
    elements.refreshGroups.disabled = false;
  }
}

function formPayload() {
  const selected = elements.groupSelect.selectedOptions[0];
  return {
    groupId: elements.groupSelect.value,
    groupName: selected?.dataset.groupName || selected?.textContent || "",
    message: elements.message.value,
    scheduleType: new FormData(elements.form).get("scheduleType"),
    scheduledAt: elements.scheduledAt.value,
    timezone: WIB_TIMEZONE,
    maxRetries: Number(elements.maxRetries.value)
  };
}

function showFormError(message) {
  elements.formError.textContent = message;
  elements.formError.hidden = !message;
}

function resetForm() {
  state.editingId = null;
  elements.form.reset();
  elements.scheduledAt.value = wibInputValue();
  elements.maxRetries.value = "3";
  elements.formTitle.textContent = "New reminder";
  elements.submit.textContent = "Schedule reminder";
  elements.cancelEdit.hidden = true;
  elements.messageCount.value = "0 / 4096";
  showFormError("");
}

function editReminder(id) {
  const reminder = state.reminders.find((item) => item.id === id);
  if (!reminder) return;

  state.editingId = id;
  if (!state.groups.some((group) => group.id === reminder.groupId)) {
    state.groups.push({ id: reminder.groupId, name: reminder.groupName });
    renderGroupOptions();
  }
  elements.groupSelect.value = reminder.groupId;
  elements.message.value = reminder.message;
  elements.messageCount.value = `${reminder.message.length} / 4096`;
  elements.scheduledAt.value = reminder.scheduledLocal.slice(0, 16);
  elements.maxRetries.value = String(reminder.maxRetries);
  const radio = elements.form.querySelector(`[name="scheduleType"][value="${reminder.scheduleType}"]`);
  if (radio) radio.checked = true;
  elements.formTitle.textContent = "Edit reminder";
  elements.submit.textContent = "Save changes";
  elements.cancelEdit.hidden = false;
  showFormError("");
  elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.groupSelect.focus({ preventScroll: true });
}

function toast(message, kind = "success") {
  const item = document.createElement("div");
  item.className = "toast";
  item.dataset.kind = kind;
  item.textContent = message;
  elements.toastRegion.replaceChildren(item);
  window.setTimeout(() => item.remove(), 4200);
}

async function submitForm(event) {
  event.preventDefault();
  showFormError("");

  if (!elements.form.reportValidity()) return;
  elements.submit.disabled = true;
  elements.submit.textContent = state.editingId ? "Saving changes" : "Scheduling reminder";

  try {
    const path = state.editingId ? `/api/reminders/${state.editingId}` : "/api/reminders";
    const method = state.editingId ? "PUT" : "POST";
    await api(path, { method, body: JSON.stringify(formPayload()) });
    toast(state.editingId ? "Reminder updated." : "Reminder scheduled in WIB.");
    resetForm();
    await loadReminders();
  } catch (error) {
    const fieldMessage = error.fields ? Object.values(error.fields).flat().find(Boolean) : null;
    showFormError(fieldMessage || error.message);
  } finally {
    elements.submit.disabled = false;
    elements.submit.textContent = state.editingId ? "Save changes" : "Schedule reminder";
  }
}

async function reminderAction(event) {
  const control = event.target.closest("button[data-action]");
  if (!control) return;
  const { action, id } = control.dataset;

  if (action === "edit") {
    editReminder(id);
    return;
  }
  if (action === "history") {
    await showHistory(id);
    return;
  }
  if (action === "cancel" && !window.confirm("Cancel this reminder? It will remain in the history list.")) {
    return;
  }

  const endpoints = {
    send: { path: "send-now", copy: "Message sent to the group." },
    pause: { path: "pause", copy: "Reminder paused." },
    resume: { path: "resume", copy: "Reminder resumed." },
    cancel: { path: "", copy: "Reminder cancelled.", method: "DELETE" }
  };
  const operation = endpoints[action];
  if (!operation) return;

  control.disabled = true;
  try {
    const suffix = operation.path ? `/${operation.path}` : "";
    await api(`/api/reminders/${id}${suffix}`, { method: operation.method || "POST" });
    toast(operation.copy);
    await loadReminders();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    control.disabled = false;
  }
}

async function showHistory(id) {
  const reminder = state.reminders.find((item) => item.id === id);
  document.querySelector("#delivery-title").textContent = reminder ? `${reminder.groupName} deliveries` : "Reminder deliveries";
  elements.deliveryContent.textContent = "Loading delivery history.";
  elements.deliveryDialog.showModal();

  try {
    const response = await api(`/api/reminders/${id}/deliveries`);
    if (!response.deliveries.length) {
      elements.deliveryContent.textContent = "No send attempts have been recorded for this reminder.";
      return;
    }

    const list = document.createElement("ol");
    list.className = "delivery-list";
    for (const delivery of response.deliveries) {
      const row = document.createElement("li");
      row.className = "delivery-row";
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = delivery.status === "sent" ? "Sent" : "Failed";
      const details = document.createElement("p");
      details.textContent = `${delivery.deliveryType === "manual" ? "Manual send" : `Scheduled attempt ${delivery.attemptNumber}`} at ${fullWibDate(delivery.attemptedAt)}`;
      content.append(title, details);
      if (delivery.errorMessage) {
        const error = document.createElement("p");
        error.textContent = delivery.errorMessage;
        content.append(error);
      }
      const status = document.createElement("span");
      status.className = "status-label";
      status.dataset.status = delivery.status;
      status.textContent = delivery.status === "sent" ? "Sent" : "Failed";
      row.append(content, status);
      list.append(row);
    }
    elements.deliveryContent.replaceChildren(list);
  } catch (error) {
    elements.deliveryContent.textContent = `${error.message} Close this window and try again.`;
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  elements.themeToggle.textContent = dark ? "Light theme" : "Dark theme";
  elements.themeToggle.setAttribute("aria-pressed", String(dark));
  localStorage.setItem("waha-reminder-theme", theme);
}

function initializeTheme() {
  const saved = localStorage.getItem("waha-reminder-theme");
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(saved || preferred);
}

elements.form.addEventListener("submit", submitForm);
elements.message.addEventListener("input", () => {
  elements.messageCount.value = `${elements.message.value.length} / 4096`;
});
elements.cancelEdit.addEventListener("click", resetForm);
elements.refreshGroups.addEventListener("click", loadGroups);
elements.refreshReminders.addEventListener("click", loadReminders);
elements.filter.addEventListener("change", renderReminders);
elements.reminderList.addEventListener("click", reminderAction);
elements.closeDelivery.addEventListener("click", () => elements.deliveryDialog.close());
elements.deliveryDialog.addEventListener("click", (event) => {
  if (event.target === elements.deliveryDialog) elements.deliveryDialog.close();
});
elements.themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

initializeTheme();
resetForm();
await Promise.all([loadSession(), loadGroups(), loadReminders()]);
