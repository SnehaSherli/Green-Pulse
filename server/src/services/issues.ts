import { Types } from "mongoose";
import { EnvironmentalImpact, Issue, IssueStatus, Category, Severity } from "../models";
import { impactFor } from "./rules";
import { notifyRole, notifyUsers } from "./notify";

export function historyEntry(status: IssueStatus, action: string, user: { id: string; name: string }, note = "") {
  return { status, action, by: new Types.ObjectId(user.id), byName: user.name, note, at: new Date() };
}

/** Overdue rule: an unresolved issue past its due date is escalated (once) and admins are told. */
export async function escalateOverdue() {
  const now = new Date();
  const overdue = await Issue.find({ status: { $in: ["REPORTED", "ASSIGNED", "IN_PROGRESS"] }, escalated: false, dueDate: { $lt: now } }).populate("location", "name");
  for (const i of overdue) {
    i.escalated = true;
    i.escalatedAt = now;
    i.history.push({ status: i.status as IssueStatus, action: "Escalated: issue is past its due date", byName: "System", note: "", at: now } as any);
    await i.save();
    const loc = (i.location as any)?.name ?? "a location";
    await notifyRole("ADMIN", { type: "ESCALATION", title: "Overdue issue escalated", message: `“${i.title}” at ${loc} is past its due date.`, link: `/admin/issues/${i._id}`, issue: i._id });
    if (i.assignedTo) await notifyUsers([i.assignedTo], { type: "ESCALATION", title: "Your issue is overdue", message: `“${i.title}” at ${loc} is past its due date.`, link: `/staff/issues/${i._id}`, issue: i._id });
  }
  return overdue.length;
}

/** Called when the inspector approves the fix: records the environmental benefit in MongoDB. */
export async function recordImpact(issue: { _id: Types.ObjectId; location: Types.ObjectId; category: string; severity: string }) {
  const d = new Date();
  const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  await EnvironmentalImpact.updateOne(
    { issue: issue._id },
    { $setOnInsert: { issue: issue._id, location: issue.location, category: issue.category, period, recordedAt: d, ...impactFor(issue.category as Category, issue.severity as Severity) } },
    { upsert: true }
  );
}
