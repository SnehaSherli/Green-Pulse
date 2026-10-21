import { Schema, model } from "mongoose";

export const RESULTS = ["COMPLIANT", "NON_COMPLIANT", "NOT_APPLICABLE"] as const;
export type Result = (typeof RESULTS)[number];

const responseSchema = new Schema(
  {
    inspection: { type: Schema.Types.ObjectId, ref: "Inspection", required: true, index: true },
    location: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    standard: { type: Schema.Types.ObjectId, ref: "Standard", required: true },
    // snapshots so history stays readable even if the standard is edited later
    standardTitle: { type: String, required: true },
    category: { type: String, required: true },
    result: { type: String, enum: RESULTS, required: true },
    remarks: { type: String, default: "" },
    issue: { type: Schema.Types.ObjectId, ref: "Issue", default: null },
  },
  { timestamps: true }
);
export const ChecklistResponse = model("ChecklistResponse", responseSchema);
