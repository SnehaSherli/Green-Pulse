import { Schema, model } from "mongoose";

// One record is written when an issue is verified and CLOSED.
// Values are rule-based estimates (see services/impact.ts) — documented as such in the UI.
const impactSchema = new Schema(
  {
    location: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    issue: { type: Schema.Types.ObjectId, ref: "Issue", required: true, unique: true },
    category: { type: String, required: true },
    period: { type: String, required: true, index: true }, // YYYY-MM
    wasteRecycledKg: { type: Number, default: 0 },
    waterSavedL: { type: Number, default: 0 },
    energySavedKwh: { type: Number, default: 0 },
    plasticReducedKg: { type: Number, default: 0 },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
export const EnvironmentalImpact = model("EnvironmentalImpact", impactSchema);
