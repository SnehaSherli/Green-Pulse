import { Router } from "express";
import { auth } from "../middleware/auth";
import { Issue } from "../models";
import { adminDashboard, impactSummary, inspectorDashboard, periodRange, reportSummary, staffDashboard } from "../services/dashboard";
import { escalateOverdue } from "../services/issues";
import { issuePopulate } from "../services/serializers";

const router = Router();

router.get("/dashboard/admin", auth("ADMIN"), async (_req, res) => {
  await escalateOverdue();
  res.json(await adminDashboard());
});
router.get("/dashboard/inspector", auth("INSPECTOR"), async (req, res) => res.json(await inspectorDashboard(req.user!.id)));
router.get("/dashboard/staff", auth("STAFF"), async (req, res) => {
  await escalateOverdue();
  res.json(await staffDashboard(req.user!.id));
});

router.get("/impact", auth("ADMIN"), async (_req, res) => res.json(await impactSummary()));

const per = (q: unknown) => (["month", "quarter", "year"].includes(String(q)) ? String(q) : "month");
router.get("/reports/summary", auth("ADMIN"), async (req, res) => res.json(await reportSummary(per(req.query.period))));

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
router.get("/reports/issues.csv", auth("ADMIN"), async (req, res) => {
  const { from, to } = periodRange(per(req.query.period));
  const issues: any[] = await Issue.find({ createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).populate(issuePopulate).lean();
  const head = ["Issue ID", "Title", "Location", "Category", "Severity", "Status", "Repeated", "Assigned to", "Reported", "Due", "Closed"];
  const rows = issues.map((i) => [i._id, i.title, i.location?.name, i.category, i.severity, i.status, i.isRepeated ? "yes" : "no", i.assignedTo?.name ?? "", i.createdAt?.toISOString(), i.dueDate?.toISOString() ?? "", i.closedAt?.toISOString() ?? ""]);
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="greenpulse-issues-${per(req.query.period)}.csv"` });
  res.send([head, ...rows].map((r) => r.map(csv).join(",")).join("\n"));
});

export default router;
