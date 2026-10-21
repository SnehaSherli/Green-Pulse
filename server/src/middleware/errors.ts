import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { HttpError } from "../http";

export const apiNotFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `No such API route: ${req.method} ${req.path}`, code: "NOT_FOUND" });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({ error: `${first.path.join(".") || "body"}: ${first.message}`, code: "VALIDATION", issues: err.issues });
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Image is too large (max 6 MB)" : err.message, code: "UPLOAD" });
    return;
  }
  if (err?.name === "CastError") {
    res.status(404).json({ error: "Resource not found", code: "NOT_FOUND" });
    return;
  }
  if (err?.code === 11000) {
    res.status(409).json({ error: "A record with the same unique value already exists", code: "DUPLICATE" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error", code: "SERVER" });
};
