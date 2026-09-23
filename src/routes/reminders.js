import { Router } from "express";
import {
  cancelReminder,
  createReminder,
  listDeliveries,
  listReminders,
  pauseReminder,
  resumeReminder,
  sendReminderNow,
  updateReminder
} from "../services/reminders.js";

export const reminderRouter = Router();

reminderRouter.get("/", async (req, res) => {
  res.json({ reminders: await listReminders(req.query.status) });
});

reminderRouter.post("/", async (req, res) => {
  res.status(201).json({ reminder: await createReminder(req.body) });
});

reminderRouter.put("/:id", async (req, res) => {
  res.json({ reminder: await updateReminder(req.params.id, req.body) });
});

reminderRouter.delete("/:id", async (req, res) => {
  res.json({ reminder: await cancelReminder(req.params.id) });
});

reminderRouter.post("/:id/pause", async (req, res) => {
  res.json({ reminder: await pauseReminder(req.params.id) });
});

reminderRouter.post("/:id/resume", async (req, res) => {
  res.json({ reminder: await resumeReminder(req.params.id) });
});

reminderRouter.post("/:id/send-now", async (req, res) => {
  res.json(await sendReminderNow(req.params.id));
});

reminderRouter.get("/:id/deliveries", async (req, res) => {
  res.json({ deliveries: await listDeliveries(req.params.id) });
});

