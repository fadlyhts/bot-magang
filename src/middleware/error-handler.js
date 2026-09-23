import { ZodError } from "zod";
import { AppError, WahaError } from "../lib/errors.js";
import { logger } from "../logger.js";

export function notFound(req, res) {
  res.status(404).json({ error: "Route not found." });
}

export function errorHandler(error, req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Check the submitted fields.",
      fields: error.flatten().fieldErrors
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message, details: error.details });
  }

  if (error instanceof WahaError) {
    const statusCode = error.statusCode >= 400 && error.statusCode < 500 ? 502 : 503;
    return res.status(statusCode).json({ error: error.message, details: error.details });
  }

  logger.error({ err: error, requestId: req.id }, "Unhandled request error");
  return res.status(500).json({ error: "The server could not complete this request." });
}

