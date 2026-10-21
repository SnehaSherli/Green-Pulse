import type { Request } from "express";
import { Types } from "mongoose";
import { config } from "./config";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
export const notFound = (msg = "Not found", code?: string) => new HttpError(404, msg, code);
export const badRequest = (msg: string, code?: string) => new HttpError(400, msg, code);

export function isId(v: unknown): v is string {
  return typeof v === "string" && Types.ObjectId.isValid(v) && String(new Types.ObjectId(v)) === v;
}
export function oid(v: unknown, what = "resource") {
  if (!isId(v)) throw notFound(`${what} not found`);
  return new Types.ObjectId(v);
}

/** Base URL that gets encoded in QR codes. Never trusted for authorization — only for building a link. */
export function appBaseUrl(req: Request, override?: unknown) {
  if (typeof override === "string" && /^https?:\/\/[^\s/]+$/i.test(override.replace(/\/+$/, ""))) {
    return override.replace(/\/+$/, "");
  }
  if (config.publicAppUrl) return config.publicAppUrl;
  return `${req.protocol}://${req.get("host")}`;
}
