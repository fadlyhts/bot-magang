import { Router } from "express";
import { getSession, listGroups } from "../services/waha.js";

export const wahaRouter = Router();

wahaRouter.get("/session", async (_req, res) => {
  const session = await getSession();
  res.json({
    name: session?.name,
    status: session?.status,
    account: session?.me?.pushName || session?.me?.id || null
  });
});

wahaRouter.get("/groups", async (_req, res) => {
  res.json({ groups: await listGroups() });
});

