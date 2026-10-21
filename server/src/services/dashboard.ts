import { Types } from "mongoose";
import {
  ChecklistResponse, EnvironmentalImpact, Inspection, Issue, Location, CATEGORIES, Category,
} from "../models";
import { CATEGORY_LABEL, RECOMMENDATIONS } from "./rules";

type Any = any;
const avg = (n: number[]) => (n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const OPEN = ["REPORTED", "ASSIGNED", "IN_PROGRESS", "VERIFICATION_PENDING"];

export async function adminDashboard() {
  const now = Date.now();
  const [locations, inspections, issues] = await Promise.all([
    Location.find().lean(),
    Inspection.find().sort({ inspectedAt: -1 }).select("location score inspectedAt riskFlags").lean(),
    Issue.find().populate("location", "name").lean(),
  ]);
  const active = locations.filter((l: Any) => l.status === "active");
  const scored = active.filter((l: Any) => l.latestScore !== null && l.latestScore !== undefined);
  const overallScore = avg(scored.map((l: Any) => l.latestScore));

  const d30 = now - 30 * 86400000, d60 = now - 60 * 86400000;
  const last30 = avg(inspections.filter((i: Any) => +new Date(i.inspectedAt) >= d30).map((i: Any) => i.score));
  const prev30 = avg(inspections.filter((i: Any) => +new Date(i.inspectedAt) < d30 && +new Date(i.inspectedAt) >= d60).map((i: Any) => i.score));
  const scoreChange = last30 !== null && prev30 !== null ? Math.round((last30 - prev30) * 10) / 10 : null;

  const open = issues.filter((i: Any) => OPEN.includes(i.status));
  const summary = {
    overallScore,
    scoreChange,
    totalLocations: active.length,
    totalInspections: inspections.length,
    openIssues: open.length,
    unassignedIssues: open.filter((i: Any) => i.status === "REPORTED").length,
    resolvedIssues: issues.filter((i: Any) => i.status === "CLOSED").length,
    pendingVerification: issues.filter((i: Any) => i.status === "VERIFICATION_PENDING").length,
    highRiskLocations: scored.filter((l: Any) => l.latestScore < 60).length,
    repeatedViolations: open.filter((i: Any) => i.isRepeated).length,
    overdueIssues: open.filter((i: Any) => i.dueDate && +new Date(i.dueDate) < now && i.status !== "VERIFICATION_PENDING").length,
  };

  // 6-month trend
  const trends: { month: string; score: number | null; inspections: number }[] = [];
  const base = new Date();
  for (let k = 5; k >= 0; k--) {
    const d = new Date(base.getFullYear(), base.getMonth() - k, 1);
    const key = monthKey(d);
    const inMonth = inspections.filter((i: Any) => monthKey(new Date(i.inspectedAt)) === key);
    trends.push({ month: MONTHS[d.getMonth()], score: avg(inMonth.map((i: Any) => i.score)), inspections: inMonth.length });
  }

  // compliance by category
  const responses = await ChecklistResponse.find({ result: { $ne: "NOT_APPLICABLE" } }).select("category result").lean();
  const categories = CATEGORIES.map((c) => {
    const rs = responses.filter((r: Any) => r.category === c);
    const ok = rs.filter((r: Any) => r.result === "COMPLIANT").length;
    return { category: c, label: CATEGORY_LABEL[c], value: rs.length ? Math.round((ok / rs.length) * 1000) / 10 : null, checks: rs.length };
  });

  // risks (rule-based, computed from live data)
  const risks: Any[] = [];
  const latestInspection = new Map<string, Any>();
  for (const i of inspections) if (!latestInspection.has(String(i.location))) latestInspection.set(String(i.location), i);
  for (const l of scored as Any[]) {
    if (l.latestScore < 75) {
      risks.push({ id: `low-${l._id}`, type: "LOW_SCORE", title: l.latestScore < 60 ? "High risk: low compliance score" : "Compliance below target", location: l.name, detail: `Latest score ${l.latestScore}%`, severity: l.latestScore < 60 ? "high" : "medium", at: l.lastInspectionAt });
    }
    const li = latestInspection.get(String(l._id));
    const dec = li?.riskFlags?.find((f: Any) => f.type === "DECLINING_SCORE");
    if (dec) risks.push({ id: `dec-${l._id}`, type: "DECLINING_SCORE", title: "Score declining", location: l.name, detail: dec.message, severity: "medium", at: li.inspectedAt });
  }
  for (const i of open as Any[]) {
    if (i.isRepeated) risks.push({ id: `rep-${i._id}`, type: "REPEATED_VIOLATION", title: `Repeated violation: ${i.title}`, location: i.location?.name, detail: `${i.repeatCount + 1} violations in the last 60 days`, severity: "high", at: i.createdAt, issueId: String(i._id) });
    if (i.dueDate && +new Date(i.dueDate) < now && i.status !== "VERIFICATION_PENDING") risks.push({ id: `ovd-${i._id}`, type: "ESCALATION", title: `Overdue — escalated: ${i.title}`, location: i.location?.name, detail: `Due ${new Date(i.dueDate).toDateString()}`, severity: "critical", at: i.dueDate, issueId: String(i._id) });
  }
  const rank: Any = { critical: 0, high: 1, medium: 2 };
  risks.sort((a, b) => rank[a.severity] - rank[b.severity]);

  // leaderboard (with change vs previous inspection)
  const perLoc = new Map<string, number[]>();
  for (const i of inspections) perLoc.set(String(i.location), [...(perLoc.get(String(i.location)) || []), i.score]);
  const leaderboard = (scored as Any[])
    .map((l) => {
      const s = perLoc.get(String(l._id)) || [];
      return { locationId: String(l._id), location: l.name, department: l.department, score: l.latestScore, change: s.length > 1 ? Math.round((s[0] - s[1]) * 10) / 10 : 0 };
    })
    .sort((a, b) => b.score - a.score)
    .map((r, idx) => ({ rank: idx + 1, ...r }));

  // recommendations driven by categories of currently-open issues
  const catCount = new Map<Category, number>();
  open.forEach((i: Any) => catCount.set(i.category, (catCount.get(i.category) || 0) + 1));
  const recommendations = [...catCount.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ category: c, label: CATEGORY_LABEL[c], openIssues: n, text: RECOMMENDATIONS[c] }));

  return { summary, trends, categories, risks, leaderboard, recommendations };
}

export async function inspectorDashboard(userId: string) {
  const uid = new Types.ObjectId(userId);
  const mine = await Inspection.find({ inspector: uid }).sort({ inspectedAt: -1 }).populate("location", "name code").lean();
  const pending = await Issue.countDocuments({ status: "VERIFICATION_PENDING" });
  const returned = await Issue.countDocuments({ reportedBy: uid, status: "IN_PROGRESS", rejectionCount: { $gt: 0 } });
  const week = Date.now() - 7 * 86400000;
  return {
    totalInspections: mine.length,
    averageScore: avg(mine.map((i: Any) => i.score)),
    thisWeek: mine.filter((i: Any) => +new Date(i.inspectedAt) >= week).length,
    pendingVerification: pending,
    rejectedReturned: returned,
    issuesReported: await Issue.countDocuments({ reportedBy: uid }),
    recent: mine.slice(0, 6).map((i: Any) => ({ id: String(i._id), location: i.location?.name, score: i.score, result: i.result, inspectedAt: i.inspectedAt, nonCompliant: i.nonCompliant })),
  };
}

export async function staffDashboard(userId: string) {
  const uid = new Types.ObjectId(userId);
  const mine = await Issue.find({ assignedTo: uid }).populate("location", "name").sort({ dueDate: 1 }).lean();
  const count = (s: string) => mine.filter((i: Any) => i.status === s).length;
  const now = Date.now();
  return {
    assigned: count("ASSIGNED"),
    inProgress: count("IN_PROGRESS"),
    awaitingVerification: count("VERIFICATION_PENDING"),
    closed: count("CLOSED"),
    overdue: mine.filter((i: Any) => ["ASSIGNED", "IN_PROGRESS"].includes(i.status) && i.dueDate && +new Date(i.dueDate) < now).length,
    sentBack: mine.filter((i: Any) => i.status === "IN_PROGRESS" && i.rejectionCount > 0).length,
    upNext: mine.filter((i: Any) => ["ASSIGNED", "IN_PROGRESS"].includes(i.status)).slice(0, 5).map((i: Any) => ({ id: String(i._id), title: i.title, location: i.location?.name, severity: i.severity, status: i.status, dueDate: i.dueDate, rejected: i.rejectionCount > 0 })),
  };
}

export async function impactSummary() {
  const rows = await EnvironmentalImpact.find().populate("location", "name").lean();
  const sum = (k: string) => Math.round(rows.reduce((a: number, r: Any) => a + (r[k] || 0), 0) * 10) / 10;
  const byMonth = new Map<string, Any>();
  const byLoc = new Map<string, Any>();
  for (const r of rows as Any[]) {
    const m = byMonth.get(r.period) || { period: r.period, wasteRecycledKg: 0, waterSavedL: 0, energySavedKwh: 0, plasticReducedKg: 0 };
    const l = byLoc.get(String(r.location?._id)) || { location: r.location?.name, issuesClosed: 0, wasteRecycledKg: 0, waterSavedL: 0, energySavedKwh: 0, plasticReducedKg: 0 };
    l.issuesClosed++;
    for (const k of ["wasteRecycledKg", "waterSavedL", "energySavedKwh", "plasticReducedKg"]) { m[k] += r[k] || 0; l[k] += r[k] || 0; }
    byMonth.set(r.period, m);
    byLoc.set(String(r.location?._id), l);
  }
  return {
    totals: { wasteRecycledKg: sum("wasteRecycledKg"), waterSavedL: sum("waterSavedL"), energySavedKwh: sum("energySavedKwh"), plasticReducedKg: sum("plasticReducedKg"), issuesClosed: rows.length },
    byMonth: [...byMonth.values()].sort((a, b) => a.period.localeCompare(b.period)),
    byLocation: [...byLoc.values()].sort((a, b) => b.issuesClosed - a.issuesClosed),
    note: "Impact values are rule-based estimates recorded automatically when an inspector verifies and closes an issue.",
  };
}

export function periodRange(period: string) {
  const now = new Date();
  let from: Date;
  if (period === "quarter") from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  else if (period === "year") from = new Date(now.getFullYear(), 0, 1);
  else from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: now, label: period === "quarter" ? "Quarter to date" : period === "year" ? "Year to date" : "This month" };
}

export async function reportSummary(period: string) {
  const { from, to, label } = periodRange(period);
  const [inspections, issues, impact] = await Promise.all([
    Inspection.find({ inspectedAt: { $gte: from, $lte: to } }).populate("location", "name").lean(),
    Issue.find({ createdAt: { $gte: from, $lte: to } }).lean(),
    EnvironmentalImpact.find({ recordedAt: { $gte: from, $lte: to } }).lean(),
  ]);
  const closed = issues.filter((i: Any) => i.status === "CLOSED" && i.closedAt);
  const hours = closed.map((i: Any) => (+new Date(i.closedAt) - +new Date(i.createdAt)) / 3600000);
  const perLoc = new Map<string, Any>();
  for (const i of inspections as Any[]) {
    const k = i.location?.name || "—";
    const e = perLoc.get(k) || { location: k, inspections: 0, scores: [] as number[] };
    e.inspections++; e.scores.push(i.score); perLoc.set(k, e);
  }
  const perCat = CATEGORIES.map((c) => ({ category: c, label: CATEGORY_LABEL[c], raised: issues.filter((i: Any) => i.category === c).length, closed: closed.filter((i: Any) => i.category === c).length }));
  const sum = (k: string) => Math.round(impact.reduce((a: number, r: Any) => a + (r[k] || 0), 0) * 10) / 10;
  return {
    period, label, from, to,
    inspections: inspections.length,
    averageScore: avg(inspections.map((i: Any) => i.score)),
    issuesRaised: issues.length,
    issuesClosed: closed.length,
    repeatedViolations: issues.filter((i: Any) => i.isRepeated).length,
    averageResolutionHours: avg(hours),
    byLocation: [...perLoc.values()].map((e) => ({ location: e.location, inspections: e.inspections, averageScore: avg(e.scores) })).sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0)),
    byCategory: perCat,
    impact: { wasteRecycledKg: sum("wasteRecycledKg"), waterSavedL: sum("waterSavedL"), energySavedKwh: sum("energySavedKwh"), plasticReducedKg: sum("plasticReducedKg") },
  };
}
