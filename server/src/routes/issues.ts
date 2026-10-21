import { Router, Request } from "express";
import { z } from "zod";
import { HttpError, oid } from "../http";
import { auth } from "../middleware/auth";
import { CATEGORIES, Evidence, Issue, SEVERITIES, User, ISSUE_STATUSES } from "../models";
import { escalateOverdue, historyEntry, recordImpact } from "../services/issues";
import { notifyRole, notifyUsers } from "../services/notify";
import { dueDateFor } from "../services/rules";
import { evidenceOut, issueOut, issuePopulate } from "../services/serializers";
import type { Severity } from "../models";

const router = Router();
type Any = any;

/** Role-scoped visibility. STAFF only ever sees issues assigned to them. */
function scope(req: Request): Record<string, unknown> {
  return req.user!.role === "STAFF" ? { assignedTo: req.user!.id } : {};
}

async function loadIssue(req: Request) {
  const issue = await Issue.findOne({ _id: oid(req.params.id, "Issue"), ...scope(req) });
  if (!issue) throw new HttpError(404, "Issue not found", "NOT_FOUND"); // identical response for "missing" and "not yours"
  return issue;
}

router.get("/", auth("ADMIN", "INSPECTOR", "STAFF"), async (req, res) => {
  await escalateOverdue();
  const q = z
    .object({ status: z.enum(ISSUE_STATUSES).optional(), severity: z.enum(SEVERITIES).optional(), category: z.enum(CATEGORIES).optional() })
    .parse(req.query);
  const list = await Issue.find({ ...scope(req), ...q }).sort({ createdAt: -1 }).limit(500).populate(issuePopulate).lean();
  res.json(list.map(issueOut));
});

router.get("/:id", auth("ADMIN", "INSPECTOR", "STAFF"), async (req, res) => {
  await escalateOverdue();
  const issue = await Issue.findOne({ _id: oid(req.params.id, "Issue"), ...scope(req) }).populate(issuePopulate).lean();
  if (!issue) throw new HttpError(404, "Issue not found", "NOT_FOUND");
  const evidence = await Evidence.find({ issue: issue._id }).sort({ createdAt: 1 }).populate("uploadedBy", "name").lean();
  res.json({ ...issueOut(issue), evidence: evidence.map(evidenceOut) });
});

// ---- ADMIN: assign (or re-assign) to a STAFF user ----
const assignSchema = z.object({ staffId: z.string(), dueDate: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()), note: z.string().max(500).optional().default("") });
router.post("/:id/assign", auth("ADMIN"), async (req, res) => {
  const b = assignSchema.parse(req.body);
  const issue = await loadIssue(req);
  if (!["REPORTED", "ASSIGNED", "IN_PROGRESS"].includes(issue.status)) throw new HttpError(409, `An issue that is ${issue.status.replace("_", " ").toLowerCase()} cannot be (re)assigned`, "BAD_STATE");
  const staff = await User.findOne({ _id: oid(b.staffId, "Staff user"), role: "STAFF", active: true });
  if (!staff) throw new HttpError(400, "Selected user is not an active STAFF member", "BAD_ASSIGNEE");
  issue.assignedTo = staff._id;
  issue.assignedBy = req.user!.id as Any;
  issue.status = "ASSIGNED";
  issue.dueDate = b.dueDate ? new Date(b.dueDate) : issue.dueDate ?? dueDateFor(issue.severity as Severity);
  issue.escalated = false; // fresh deadline
  issue.history.push(historyEntry("ASSIGNED", `Assigned to ${staff.name}`, req.user!, b.note) as Any);
  await issue.save();
  await notifyUsers([staff._id], { type: "ISSUE_ASSIGNED", title: "New issue assigned to you", message: `${issue.title} — due ${issue.dueDate!.toDateString()}`, link: `/staff/issues/${issue._id}`, issue: issue._id });
  res.json(issueOut(await Issue.findById(issue._id).populate(issuePopulate).lean()));
});

// ---- STAFF: start work / add progress note / submit for verification ----
router.post("/:id/start", auth("STAFF"), async (req, res) => {
  const issue = await loadIssue(req);
  if (issue.status !== "ASSIGNED") throw new HttpError(409, "Only an ASSIGNED issue can be started", "BAD_STATE");
  issue.status = "IN_PROGRESS";
  issue.history.push(historyEntry("IN_PROGRESS", "Work started", req.user!) as Any);
  await issue.save();
  res.json(issueOut(await Issue.findById(issue._id).populate(issuePopulate).lean()));
});

router.post("/:id/note", auth("STAFF"), async (req, res) => {
  const { note } = z.object({ note: z.string().trim().min(2).max(1000) }).parse(req.body);
  const issue = await loadIssue(req);
  if (issue.status !== "IN_PROGRESS") throw new HttpError(409, "Progress notes can be added while the issue is In Progress", "BAD_STATE");
  issue.history.push(historyEntry("IN_PROGRESS", "Progress update", req.user!, note) as Any);
  await issue.save();
  res.json(issueOut(await Issue.findById(issue._id).populate(issuePopulate).lean()));
});

router.post("/:id/submit", auth("STAFF"), async (req, res) => {
  const { resolutionRemarks } = z.object({ resolutionRemarks: z.string().trim().min(5, "Describe how the issue was fixed (min 5 characters)").max(2000) }).parse(req.body);
  const issue = await loadIssue(req);
  if (issue.status !== "IN_PROGRESS") throw new HttpError(409, "Only an IN PROGRESS issue can be submitted for verification", "BAD_STATE");
  const afterCount = await Evidence.countDocuments({ issue: issue._id, type: "AFTER", round: issue.rejectionCount });
  if (afterCount < 1) throw new HttpError(400, "Upload at least one AFTER photo before submitting", "AFTER_EVIDENCE_REQUIRED");
  // Staff marks the fix RESOLVED, and it immediately waits for the inspector: RESOLVED -> VERIFICATION_PENDING
  issue.resolutionRemarks = resolutionRemarks;
  issue.submittedAt = new Date();
  issue.history.push(historyEntry("RESOLVED", "Marked resolved by staff", req.user!, resolutionRemarks) as Any);
  issue.status = "VERIFICATION_PENDING";
  issue.history.push(historyEntry("VERIFICATION_PENDING", "Submitted for verification", req.user!) as Any);
  await issue.save();
  await notifyRole("INSPECTOR", { type: "VERIFICATION_REQUESTED", title: "Fix ready for verification", message: `${issue.title} — compare before/after photos.`, link: `/inspector/verifications/${issue._id}`, issue: issue._id });
  res.json(issueOut(await Issue.findById(issue._id).populate(issuePopulate).lean()));
});

// ---- INSPECTOR: verification queue + approve / reject ----
router.get("/queue/verification", auth("INSPECTOR"), async (_req, res) => {
  const list = await Issue.find({ status: "VERIFICATION_PENDING" }).sort({ submittedAt: 1 }).populate(issuePopulate).lean();
  res.json(list.map(issueOut));
});

const verifySchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]), remarks: z.string().trim().max(1000).optional().default("") });
router.post("/:id/verify", auth("INSPECTOR"), async (req, res) => {
  const b = verifySchema.parse(req.body);
  if (b.decision === "REJECT" && b.remarks.length < 3) throw new HttpError(400, "Rejection remarks are required", "REMARKS_REQUIRED");
  const issue = await loadIssue(req);
  if (issue.status !== "VERIFICATION_PENDING") throw new HttpError(409, "This issue is not waiting for verification", "BAD_STATE");
  const now = new Date();
  issue.verifiedBy = req.user!.id as Any;
  issue.verifiedAt = now;
  if (b.decision === "APPROVE") {
    // Inspector approves: VERIFIED, then the issue is CLOSED
    issue.history.push(historyEntry("VERIFIED", "Fix verified by inspector", req.user!, b.remarks) as Any);
    issue.status = "CLOSED";
    issue.closedAt = now;
    issue.history.push(historyEntry("CLOSED", "Issue closed", req.user!) as Any);
    await issue.save();
    await recordImpact(issue as Any);
    if (issue.assignedTo) await notifyUsers([issue.assignedTo], { type: "ISSUE_CLOSED", title: "Fix approved — issue closed", message: issue.title, link: `/staff/issues/${issue._id}`, issue: issue._id });
    await notifyRole("ADMIN", { type: "ISSUE_CLOSED", title: "Issue closed", message: `${issue.title} was verified by ${req.user!.name}.`, link: `/admin/issues/${issue._id}`, issue: issue._id });
  } else {
    issue.status = "IN_PROGRESS";
    issue.rejectionRemarks = b.remarks;
    issue.rejectionCount += 1;
    issue.history.push(historyEntry("IN_PROGRESS", "Rejected — returned to staff", req.user!, b.remarks) as Any);
    await issue.save();
    if (issue.assignedTo) await notifyUsers([issue.assignedTo], { type: "ISSUE_REJECTED", title: "Fix rejected — please redo", message: `${issue.title}: ${b.remarks}`, link: `/staff/issues/${issue._id}`, issue: issue._id });
  }
  res.json(issueOut(await Issue.findById(issue._id).populate(issuePopulate).lean()));
});

export default router;
