import { Schema, model } from "mongoose";

export const EVIDENCE_TYPES = ["BEFORE", "AFTER"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

// Metadata lives in MongoDB; the image file itself is stored in server/uploads.
const evidenceSchema = new Schema(
  {
    type: { type: String, enum: EVIDENCE_TYPES, required: true, index: true },
    location: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    // BEFORE evidence starts "unattached" (inspection not yet submitted) and is linked on submit
    inspection: { type: Schema.Types.ObjectId, ref: "Inspection", default: null, index: true },
    response: { type: Schema.Types.ObjectId, ref: "ChecklistResponse", default: null },
    issue: { type: Schema.Types.ObjectId, ref: "Issue", default: null, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // which resubmission round (issue.rejectionCount) an AFTER photo belongs to
    round: { type: Number, default: 0 },
    fileName: { type: String, required: true },
    originalName: { type: String, default: "" },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    caption: { type: String, default: "" },
  },
  { timestamps: true }
);
export const Evidence = model("Evidence", evidenceSchema);
