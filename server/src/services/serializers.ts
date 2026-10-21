import type { Request } from "express";
import { appBaseUrl } from "../http";

type Any = any; // lean documents with populated refs

export const issuePopulate = [
  { path: "location", select: "name code department" },
  { path: "assignedTo", select: "name email" },
  { path: "reportedBy", select: "name" },
  { path: "verifiedBy", select: "name" },
];

export function locationForAdmin(l: Any, req: Request, baseOverride?: unknown) {
  const base = appBaseUrl(req, baseOverride);
  return {
    id: String(l._id),
    name: l.name,
    code: l.code,
    department: l.department,
    description: l.description || "",
    status: l.status,
    latestScore: l.latestScore ?? null,
    lastInspectionAt: l.lastInspectionAt ?? null,
    qrToken: l.qrToken,
    qrPath: `/inspect/${l.qrToken}`,
    qrUrl: `${base}/inspect/${l.qrToken}`,
    qrVersion: l.qrVersion ?? 1,
    qrGeneratedAt: l.qrGeneratedAt,
    createdAt: l.createdAt,
  };
}

/** What an inspector may see about a location (no token echo, no admin fields). */
export function locationForInspector(l: Any) {
  return { id: String(l._id), name: l.name, code: l.code, department: l.department, description: l.description || "", status: l.status };
}

export function evidenceOut(e: Any) {
  return {
    id: String(e._id),
    type: e.type,
    url: `/api/evidence/${e._id}/file`,
    issue: e.issue ? String(e.issue) : null,
    inspection: e.inspection ? String(e.inspection) : null,
    response: e.response ? String(e.response) : null,
    location: String(e.location?._id ?? e.location),
    uploadedBy: e.uploadedBy?.name ? { id: String(e.uploadedBy._id), name: e.uploadedBy.name } : { id: String(e.uploadedBy) },
    round: e.round ?? 0,
    caption: e.caption || "",
    originalName: e.originalName || "",
    createdAt: e.createdAt,
  };
}

export function issueOut(i: Any) {
  const ref = (v: Any) => (v && v._id ? { id: String(v._id), name: v.name, ...(v.email ? { email: v.email } : {}), ...(v.code ? { code: v.code } : {}) } : v ? { id: String(v) } : null);
  return {
    id: String(i._id),
    title: i.title,
    description: i.description || "",
    location: ref(i.location),
    inspection: i.inspection ? String(i.inspection) : null,
    category: i.category,
    severity: i.severity,
    status: i.status,
    reportedBy: ref(i.reportedBy),
    assignedTo: ref(i.assignedTo),
    dueDate: i.dueDate ?? null,
    isRepeated: !!i.isRepeated,
    repeatCount: i.repeatCount ?? 0,
    escalated: !!i.escalated,
    overdue: !!i.dueDate && i.status !== "CLOSED" && new Date(i.dueDate) < new Date(),
    recommendation: i.recommendation || "",
    inspectorRemarks: i.inspectorRemarks || "",
    resolutionRemarks: i.resolutionRemarks || "",
    rejectionRemarks: i.rejectionRemarks || "",
    rejectionCount: i.rejectionCount ?? 0,
    submittedAt: i.submittedAt ?? null,
    verifiedBy: ref(i.verifiedBy),
    verifiedAt: i.verifiedAt ?? null,
    closedAt: i.closedAt ?? null,
    createdAt: i.createdAt,
    history: (i.history || []).map((h: Any) => ({ status: h.status, action: h.action, byName: h.byName || "", note: h.note || "", at: h.at })),
  };
}
