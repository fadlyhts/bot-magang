import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function requireAdmin(req, res, next) {
  const authorization = req.headers.authorization || "";
  const [scheme, encoded] = authorization.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    const username = separator >= 0 ? decoded.slice(0, separator) : "";
    const password = separator >= 0 ? decoded.slice(separator + 1) : "";

    if (safeEqual(username, config.admin.username) && safeEqual(password, config.admin.password)) {
      return next();
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="WAHA Reminder", charset="UTF-8"');
  return res.status(401).json({ error: "Authentication is required." });
}

