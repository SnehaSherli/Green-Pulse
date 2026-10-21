import { Router } from "express";
import { HttpError, oid } from "../http";
import { auth } from "../middleware/auth";
import { ChecklistResponse, Evidence, Inspection, Issue } from "../models";
import { evidenceOut, issueOut, issuePopulate } from "../services/serializers";
import { submitInspection, submitSchema } from "../services/inspections";

const router = Router();

const listOut = (i: any) => ({
  id: String(i._id),
  location: i.location?._id ? { id: String(i.location._id), name: i.location.name, code: i.location.code } : null,
  inspector: i.inspector?._id ? { id: String(i.inspector._id), name: i.inspector.name } : null,
  inspectedAt: i.inspectedAt,
  score: i.score,
  applicable: i.applicable,
  compliant: i.compliant,
  nonCompliant: i.nonCompliant,
  notApplicable: i.notApplicable,
  result: i.result,
  notes: i.notes || "",
  riskFlags: i.riskFlags || [],
  recommendations: i.recommendations || [],
});

// Only an INSPECTOR may submit. Location is re-resolved from the QR token on the server.
router.post("/", auth("INSPECTOR"), async (req, res) => {
  const input = submitSchema.parse(req.body);
  const r = await submitInspection(input, req.user!);
  const insp = await Inspection.findById(r.inspectionId).populate("location", "name code").populate("inspector", "name").lean();
  const issues = await Issue.find({ inspection: r.inspectionId }).populate(issuePopulate).lean();
  res.status(201).json({ inspection: listOut(insp), issues: issues.map(issueOut) });
});

// ADMIN sees all; INSPECTOR sees own.
router.get("/", auth("ADMIN", "INSPECTOR"), async (req, res) => {
  const filter = req.user!.role === "INSPECTOR" ? { inspector: req.user!.id } : {};
  const list = await Inspection.find(filter).sort({ inspectedAt: -1 }).limit(200).populate("location", "name code").populate("inspector", "name").lean();
  res.json(list.map(listOut));
});

router.get("/:id", auth("ADMIN", "INSPECTOR"), async (req, res) => {
  const insp = await Inspection.findById(oid(req.params.id, "Inspection")).populate("location", "name code").populate("inspector", "name").lean();
  if (!insp) throw new HttpError(404, "Inspection not found");
  if (req.user!.role === "INSPECTOR" && String((insp.inspector as any)._id) !== req.user!.id) throw new HttpError(403, "Forbidden: not your inspection", "FORBIDDEN");
  const [responses, evidence, issues] = await Promise.all([
    ChecklistResponse.find({ inspection: insp._id }).lean(),
    Evidence.find({ inspection: insp._id }).populate("uploadedBy", "name").lean(),
    Issue.find({ inspection: insp._id }).populate(issuePopulate).lean(),
  ]);
  res.json({
    ...listOut(insp),
    responses: responses.map((r: any) => ({
      id: String(r._id), standardTitle: r.standardTitle, category: r.category, result: r.result, remarks: r.remarks,
      issueId: r.issue ? String(r.issue) : null,
      evidence: evidence.filter((e: any) => String(e.response) === String(r._id)).map(evidenceOut),
    })),
    issues: issues.map(issueOut),
  });
});

export default router;
