import { Schema, model, Types } from "mongoose";
import crypto from "crypto";

export const LOCATION_STATUS = ["active", "inactive"] as const;

/** 192-bit random token, hex encoded (48 chars). Not derived from any location data. */
export function newQrToken() {
  return crypto.randomBytes(24).toString("hex");
}

const locationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true },
    department: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    status: { type: String, enum: LOCATION_STATUS, default: "active", index: true },
    // The QR only *identifies* the location. It never grants any permission.
    qrToken: { type: String, required: true, unique: true, index: true },
    qrGeneratedAt: { type: Date, default: Date.now },
    qrVersion: { type: Number, default: 1 },
    latestScore: { type: Number, default: null },
    lastInspectionAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export interface LocationDoc {
  _id: Types.ObjectId;
  name: string;
  code: string;
  department: string;
  description?: string;
  status: "active" | "inactive";
  qrToken: string;
  qrGeneratedAt: Date;
  qrVersion: number;
  latestScore: number | null;
  lastInspectionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export const Location = model("Location", locationSchema);
