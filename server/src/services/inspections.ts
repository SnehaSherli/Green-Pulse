import { Types } from "mongoose";
import { z } from "zod";
import { badRequest, HttpError, isId } from "../http";
import {
  ChecklistResponse, Evidence, Inspection, Issue, Location, Standard, Category, Severity, Result, RESULTS,
} from "../models";
import { REPEAT_WINDOW_DAYS, RECOMMENDATIONS, bumpSeverity, computeScore, dueDateFor, scoreRisk, RiskFlag } from "./rules";
import { notifyRole } from "./notify";
import type { AuthUser } from "../middleware/auth";

type Any = any;

export const submitSchema = z.object({
  qrToken: z.string().min(8).max(200),
  notes: z.string().max(2000).optional().default(""),
  responses: z
    .array(
      z.object({
        standardId: z.string(),
        result: z.enum(RESULTS),
        remarks: z.string().max(2000).optional().default(""),
        evidenceIds: z.array(z.string()).max(10).optional().default([]),
      })
    )
    .min(1),
});

/** Resolve a QR token to an ACTIVE location, or throw the right HTTP error. The token grants no permissions. */
export async function resolveQr(token: string) {
  if (!/^[a-f0-9]{16,128}$/i.test(token)) throw new HttpError(404, "Location not found", "LOCATION_NOT_FOUND");
  const loc = await Location.findOne({ qrToken: token }).lean();
  if (!loc) throw new HttpError(404, "Location not found", "LOCATION_NOT_FOUND");
  if (loc.status !== "active") throw new HttpError(409, "Location is inactive.", "LOCATION_INACTIVE");
  return loc;
}

/** Checklist = active standards that apply to every location or explicitly to this one. Read from MongoDB. */
export async function checklistFor(locationId: Types.ObjectId) {
  const all = await Standard.find({ active: true }).sort({ order: 1, createdAt: 1 }).lean();
  return all.filter((s: Any) => !s.locations?.length || s.locations.some((l: Any) => String(l) === String(locationId)));
}

export async function submitInspection(input: z.infer<typeof submitSchema>, inspector: AuthUser, opts: { at?: Date } = {}) {
  const loc = await resolveQr(input.qrToken);
  const checklist = await checklistFor(loc._id);
  const byId = new Map(checklist.map((s: Any) => [String(s._id), s]));

  // ---- validate responses against the server-side checklist (never trust the client's list)
  const seen = new Set<string>();
  for (const r of input.responses) {
    if (!isId(r.standardId) || !byId.has(r.standardId)) throw badRequest("A response refers to a checklist item that does not apply to this location", "BAD_CHECKLIST");
    if (seen.has(r.standardId)) throw badRequest("Duplicate response for a checklist item", "BAD_CHECKLIST");
    seen.add(r.standardId);
    if (r.result === "NON_COMPLIANT" && r.remarks.trim().length < 3) throw badRequest(`Remarks are required for Non-Compliant item “${(byId.get(r.standardId) as Any).title}”`, "REMARKS_REQUIRED");
    if (r.result !== "NON_COMPLIANT" && r.evidenceIds.length) throw badRequest("Before-evidence can only be attached to Non-Compliant items", "BAD_EVIDENCE");
  }
  const missing = checklist.filter((s: Any) => !seen.has(String(s._id)));
  if (missing.length) throw badRequest(`Please answer every checklist item (missing: ${missing.map((m: Any) => m.title).join(", ")})`, "INCOMPLETE");

  const counts: Record<Result, number> = { COMPLIANT: 0, NON_COMPLIANT: 0, NOT_APPLICABLE: 0 };
  input.responses.forEach((r) => counts[r.result]++);
  const score = computeScore(counts.COMPLIANT, counts.NON_COMPLIANT);
  if (score === null) throw badRequest("At least one applicable (Compliant / Non-Compliant) item is required to compute a score", "NO_APPLICABLE");

  // ---- validate evidence ownership: uploaded by THIS inspector, BEFORE type, unattached, same location
  const evIds = input.responses.flatMap((r) => r.evidenceIds);
  if (evIds.some((e) => !isId(e))) throw badRequest("Invalid evidence id", "BAD_EVIDENCE");
  const evDocs = evIds.length ? await Evidence.find({ _id: { $in: evIds } }).lean() : [];
  const evMap = new Map(evDocs.map((e: Any) => [String(e._id), e]));
  for (const id of evIds) {
    const e: Any = evMap.get(id);
    if (!e || String(e.uploadedBy) !== inspector.id || e.type !== "BEFORE" || e.inspection || String(e.location) !== String(loc._id)) {
      throw badRequest("An attached evidence photo is not valid for this inspection", "BAD_EVIDENCE");
    }
  }

  // ---- repeated-violation detection + severity
  const ref = (opts.at ?? new Date()).getTime();
  const since = new Date(ref - REPEAT_WINDOW_DAYS * 86400000);
  const priorIssues = await Issue.find({ location: loc._id, createdAt: { $gte: since, $lt: new Date(ref) } }).select("standard").lean();
  const priorCount = new Map<string, number>();
  priorIssues.forEach((p: Any) => p.standard && priorCount.set(String(p.standard), (priorCount.get(String(p.standard)) || 0) + 1));

  const prevInspections = await Inspection.find({ location: loc._id, inspectedAt: { $lt: new Date(ref) } }).sort({ inspectedAt: -1 }).limit(3).select("score").lean();
  const flags: RiskFlag[] = scoreRisk(score, prevInspections.map((p: Any) => p.score));

  const inspectionId = new Types.ObjectId();
  const now = opts.at ?? new Date();
  const responseDocs: Any[] = [];
  const issueDocs: Any[] = [];
  const failedCategories = new Set<Category>();

  for (const r of input.responses) {
    const std: Any = byId.get(r.standardId);
    const responseId = new Types.ObjectId();
    let issueId: Types.ObjectId | null = null;
    if (r.result === "NON_COMPLIANT") {
      issueId = new Types.ObjectId();
      const repeats = priorCount.get(r.standardId) || 0;
      let severity = std.severity as Severity;
      if (repeats > 0) severity = bumpSeverity(severity);
      failedCategories.add(std.category);
      if (repeats > 0) flags.push({ type: "REPEATED_VIOLATION", level: "high", message: `“${std.title}” failed again — ${repeats + 1} violations in the last ${REPEAT_WINDOW_DAYS} days` });
      issueDocs.push({
        _id: issueId,
        createdAt: now,
        title: std.title,
        description: r.remarks,
        location: loc._id,
        inspection: inspectionId,
        response: responseId,
        standard: std._id,
        category: std.category,
        severity,
        status: "REPORTED",
        reportedBy: new Types.ObjectId(inspector.id),
        dueDate: dueDateFor(severity, now),
        isRepeated: repeats > 0,
        repeatCount: repeats,
        recommendation: RECOMMENDATIONS[std.category as Category],
        inspectorRemarks: r.remarks,
        history: [{ status: "REPORTED", action: "Issue created from inspection", by: new Types.ObjectId(inspector.id), byName: inspector.name, note: r.remarks, at: now }],
      });
    }
    responseDocs.push({
      _id: responseId,
      inspection: inspectionId,
      location: loc._id,
      standard: std._id,
      standardTitle: std.title,
      category: std.category,
      result: r.result,
      remarks: r.remarks,
      issue: issueId,
      __evidence: r.evidenceIds,
    });
  }

  const recommendations = [...failedCategories].map((c) => RECOMMENDATIONS[c]);

  // ---- persist. (Plain MongoDB standalone has no multi-document transactions, so we compensate on failure.)
  try {
    await Inspection.create({
      _id: inspectionId,
      createdAt: now,
      location: loc._id,
      inspector: new Types.ObjectId(inspector.id),
      qrTokenUsed: input.qrToken,
      qrVersionUsed: loc.qrVersion,
      inspectedAt: now,
      score,
      applicable: counts.COMPLIANT + counts.NON_COMPLIANT,
      compliant: counts.COMPLIANT,
      nonCompliant: counts.NON_COMPLIANT,
      notApplicable: counts.NOT_APPLICABLE,
      notes: input.notes,
      riskFlags: flags,
      recommendations,
      result: counts.NON_COMPLIANT === 0 ? "passed" : "needs_action",
    });
    await ChecklistResponse.insertMany(responseDocs.map(({ __evidence, ...d }) => d));
    if (issueDocs.length) await Issue.insertMany(issueDocs);
    for (const r of responseDocs) {
      if (r.__evidence.length) {
        await Evidence.updateMany({ _id: { $in: r.__evidence } }, { $set: { inspection: inspectionId, response: r._id, issue: r.issue } });
      }
    }
    await Location.updateOne({ _id: loc._id }, { $set: { latestScore: score, lastInspectionAt: now } });
  } catch (err) {
    await Promise.allSettled([
      Issue.deleteMany({ inspection: inspectionId }),
      ChecklistResponse.deleteMany({ inspection: inspectionId }),
      Inspection.deleteOne({ _id: inspectionId }),
    ]);
    throw err;
  }

  // ---- notifications (non-critical; skipped for back-dated demo history)
  try {
    if (!opts.at && issueDocs.length) {
      await notifyRole("ADMIN", {
        type: "ISSUE_CREATED",
        title: `${issueDocs.length} new issue${issueDocs.length > 1 ? "s" : ""} at ${loc.name}`,
        message: `Inspection by ${inspector.name} scored ${score}%. Assign the issue${issueDocs.length > 1 ? "s" : ""} to staff.`,
        link: "/admin/issues",
      });
    }
    const high = flags.filter((f) => f.level === "high");
    if (!opts.at && high.length) {
      await notifyRole("ADMIN", { type: "RISK_ALERT", title: `Risk alert: ${loc.name}`, message: high.map((h) => h.message).join(" · "), link: "/admin/dashboard" });
    }
  } catch (e) {
    console.error("notification failure", e);
  }

  return { inspectionId, locationName: loc.name, score, issueIds: issueDocs.map((d) => d._id as Types.ObjectId) };
}
