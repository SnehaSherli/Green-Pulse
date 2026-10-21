import { Schema, model } from "mongoose";
import { CATEGORIES, SEVERITIES } from "./Standard";

export const ISSUE_STATUSES = ["REPORTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "VERIFICATION_PENDING", "VERIFIED", "CLOSED"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

const historySchema = new Schema(
  {
    status: { type: String, enum: ISSUE_STATUSES, required: true },
    action: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    byName: { type: String },
    note: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const issueSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    location: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    inspection: { type: Schema.Types.ObjectId, ref: "Inspection", required: true, index: true },
    response: { type: Schema.Types.ObjectId, ref: "ChecklistResponse" },
    standard: { type: Schema.Types.ObjectId, ref: "Standard", index: true },
    category: { type: String, enum: CATEGORIES, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    status: { type: String, enum: ISSUE_STATUSES, default: "REPORTED", index: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    dueDate: { type: Date },
    // repeated-violation detection
    isRepeated: { type: Boolean, default: false },
    repeatCount: { type: Number, default: 0 },
    escalated: { type: Boolean, default: false },
    escalatedAt: { type: Date },
    recommendation: { type: String, default: "" },
    inspectorRemarks: { type: String, default: "" },
    resolutionRemarks: { type: String, default: "" },
    rejectionRemarks: { type: String, default: "" },
    rejectionCount: { type: Number, default: 0 },
    submittedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    closedAt: { type: Date },
    history: [historySchema],
  },
  { timestamps: true }
);
export const Issue = model("Issue", issueSchema);
