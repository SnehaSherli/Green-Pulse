import { Schema, model } from "mongoose";

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true }, // ISSUE_CREATED | ISSUE_ASSIGNED | VERIFICATION_REQUESTED | ISSUE_REJECTED | ISSUE_CLOSED | RISK_ALERT | ESCALATION
    title: { type: String, required: true },
    message: { type: String, default: "" },
    link: { type: String, default: "" },
    issue: { type: Schema.Types.ObjectId, ref: "Issue" },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);
export const Notification = model("Notification", notificationSchema);
