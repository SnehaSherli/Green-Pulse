import { Schema, model } from "mongoose";

export const CATEGORIES = ["waste", "water", "energy", "cleanliness", "green"] as const;
export type Category = (typeof CATEGORIES)[number];
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

const standardSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    category: { type: String, enum: CATEGORIES, required: true, index: true },
    // Severity of an issue raised when this item is Non-Compliant (before repeat-escalation)
    severity: { type: String, enum: SEVERITIES, default: "medium" },
    // Empty = applies to every location, otherwise only to the listed locations
    locations: [{ type: Schema.Types.ObjectId, ref: "Location" }],
    active: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);
export const Standard = model("Standard", standardSchema);
