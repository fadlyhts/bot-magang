import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseUrl = "http://127.0.0.1:8080";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  httpCredentials: {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD
  },
  colorScheme: "light",
  reducedMotion: "reduce"
});
const page = await context.newPage();
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
page.on("dialog", (dialog) => dialog.accept());

await page.route("**/api/waha/session", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ name: "default", status: "WORKING", account: "[TEST ACCOUNT]" })
}));
await page.route("**/api/waha/groups", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ groups: [{ id: "120363000000000000@g.us", name: "[UI TEST GROUP]" }] })
}));
await page.route("**/api/reminders/*/send-now", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ status: "sent", messageId: "ui-test-only" })
}));

async function expectVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

try {
  await mkdir("artifacts", { recursive: true });
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await expectVisible(page.getByRole("heading", { name: "Upcoming reminders" }), "Page heading");
  await expectVisible(page.getByText("WhatsApp connected as [TEST ACCOUNT]"), "Connected state");
  await expectVisible(page.getByText("No active reminders."), "Empty state");
  await page.screenshot({ path: "artifacts/dashboard-desktop-light.png", fullPage: true });

  await page.getByRole("button", { name: "Dark theme" }).click();
  if ((await page.locator("html").getAttribute("data-theme")) !== "dark") throw new Error("Dark theme did not activate.");
  await page.screenshot({ path: "artifacts/dashboard-desktop-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Light theme" }).click();

  await page.getByRole("button", { name: "Reload groups" }).click();
  await page.getByLabel("WhatsApp group").selectOption("120363000000000000@g.us");
  await page.getByLabel("Daily").check();
  await page.getByLabel("Weekdays").check();
  await page.getByLabel("Weekly").check();
  await page.getByLabel("One time").check();
  await page.getByLabel("Message").fill("[TEST] UI lifecycle check.");
  await page.getByLabel("Retries after a failed send").selectOption("2");
  await page.getByRole("button", { name: "Schedule reminder" }).click();

  await expectVisible(page.getByText("Reminder scheduled in WIB."), "Create confirmation");
  await expectVisible(page.getByRole("heading", { name: "[UI TEST GROUP]" }), "Created reminder");

  await page.getByRole("button", { name: "Send now" }).click();
  await expectVisible(page.getByText("Message sent to the group."), "Send-now confirmation");

  await page.getByRole("button", { name: "History" }).click();
  await expectVisible(page.getByRole("dialog"), "Delivery dialog");
  await expectVisible(page.getByText("No send attempts have been recorded"), "Delivery empty state");
  await page.keyboard.press("Escape");
  if (await page.getByRole("dialog").isVisible()) throw new Error("Escape did not close the delivery dialog.");

  await page.getByRole("button", { name: "Edit" }).click();
  await expectVisible(page.getByRole("heading", { name: "Edit reminder" }), "Edit state");
  await page.getByRole("button", { name: "Stop editing" }).click();
  await expectVisible(page.getByRole("heading", { name: "New reminder" }), "Edit cancellation state");

  await page.getByRole("button", { name: "Pause" }).click();
  await expectVisible(page.getByText("Reminder paused."), "Pause confirmation");
  await page.getByRole("button", { name: "Resume" }).click();
  await expectVisible(page.getByText("Reminder resumed."), "Resume confirmation");

  await page.getByRole("button", { name: "Refresh list" }).click();
  await page.getByLabel("Show").selectOption("all");
  if (await page.locator(".toast").count() > 1) throw new Error("Action notices stacked instead of replacing one another.");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({ path: "artifacts/dashboard-mobile.png" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Mobile layout has ${overflow}px of horizontal overflow.`);

  const shortTargets = await page.locator("button, select, input[type='datetime-local'], textarea, .choice-row label").evaluateAll((nodes) => nodes
    .filter((node) => !node.hidden && getComputedStyle(node).display !== "none")
    .map((node) => ({ label: node.textContent?.trim() || node.getAttribute("aria-label") || node.tagName, height: node.getBoundingClientRect().height }))
    .filter((target) => target.height > 0 && target.height < 44));
  if (shortTargets.length) throw new Error(`Tap targets below 44px: ${JSON.stringify(shortTargets)}`);

  for (const width of [600, 800, 1080]) {
    await page.setViewportSize({ width, height: 900 });
    const widthOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (widthOverflow > 1) throw new Error(`${width}px layout has ${widthOverflow}px of horizontal overflow.`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (zoomOverflow > 1) throw new Error(`Layout at 200% text size has ${zoomOverflow}px of horizontal overflow.`);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

  await page.getByRole("button", { name: "Cancel" }).click();
  await expectVisible(page.getByText("Reminder cancelled."), "Cancel confirmation");

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (focused !== "Skip to reminders") throw new Error(`Unexpected first keyboard focus: ${focused}`);

  if (errors.length) throw new Error(errors.join("\n"));
  console.log("UI smoke test passed: themes, form, actions, dialog, keyboard, desktop, and mobile.");
} finally {
  await browser.close();
}
