import { Schema, model } from "mongoose";

const riskFlagSchema = new Schema(
  { type: { type: String, required: true }, level: { type: String, required: true }, message: { type: String, required: true } },
  { _id: false }
);

const inspectionSchema = new Schema(
  {
    location: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    inspector: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // QR token that was used to start this inspection (audit trail)
    qrTokenUsed: { type: String },
    qrVersionUsed: { type: Number },
    inspectedAt: { type: Date, default: Date.now, index: true },
    score: { type: Number, required: true },
    applicable: { type: Number, required: true },
    compliant: { type: Number, required: true },
    nonCompliant: { type: Number, required: true },
    notApplicable: { type: Number, required: true },
    notes: { type: String, default: "" },
    riskFlags: [riskFlagSchema],
    recommendations: [{ type: String }],
    result: { type: String, enum: ["passed", "needs_action"], required: true },
  },
  { timestamps: true }
);
export const Inspection = model("Inspection", inspectionSchema);
