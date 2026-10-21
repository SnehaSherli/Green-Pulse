import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { DEMO_PASSWORD } from "../config";
import { Inspection, Issue, Location, Standard, User, newQrToken, Category, Severity, Role } from "../models";
import { historyEntry, recordImpact } from "./issues";
import { submitInspection } from "./inspections";
import { notifyUsers } from "./notify";

const DEMO_USERS: { name: string; email: string; role: Role }[] = [
  { name: "Ananya Sharma", email: "admin@gmail.com", role: "ADMIN" },
  { name: "Priya Nair", email: "inspector@gmail.com", role: "INSPECTOR" },
  { name: "Ravi Kumar", email: "staff@gmail.com", role: "STAFF" },
];

// The 5 CORE items apply to every location (so a brand-new location scores out of 5).
// The EXTRA items are attached only to some locations, to show location-specific checklists.
const CORE: { title: string; description: string; category: Category; severity: Severity }[] = [
  { title: "Cleanliness", description: "Floors, tables and surfaces are clean and free of litter.", category: "cleanliness", severity: "medium" },
  { title: "Waste Segregation", description: "Wet, dry and recyclable waste are kept in separate, labelled bins.", category: "waste", severity: "high" },
  { title: "Dustbin Availability", description: "Enough bins are available and none are overflowing.", category: "waste", severity: "medium" },
  { title: "Water Leakage", description: "No leaking taps, pipes or overflowing tanks.", category: "water", severity: "high" },
  { title: "Washroom Hygiene", description: "Washrooms and sinks are clean, stocked and odour-free.", category: "cleanliness", severity: "medium" },
];
const EXTRA: { title: string; description: string; category: Category; severity: Severity; at: string[] }[] = [
  { title: "Energy Usage", description: "Lights, fans and AC are switched off when the space is not in use.", category: "energy", severity: "medium", at: ["Library", "Boys Hostel", "CSE Block", "ECE Block"] },
  { title: "Plastic Usage", description: "No single-use plastic in use or on display.", category: "green", severity: "low", at: ["Library", "Boys Hostel", "CSE Block", "ECE Block"] },
  { title: "Safety / Green Standard", description: "Fire-safety and green-campus signage is visible and up to date.", category: "green", severity: "high", at: ["CSE Block", "ECE Block"] },
];

// NOTE: "Main Canteen" is deliberately NOT seeded so it can be created live during the demo.
const LOCATIONS = [
  ["Library", "Academic Block", "LIB"], ["Boys Hostel", "Residential", "HOS"], ["CSE Block", "Academic Block", "CSE"], ["ECE Block", "Academic Block", "ECE"],
];

/** Idempotent: only creates what is missing, never overwrites existing data. */
export async function ensureSeedData(log = console.log) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of DEMO_USERS) {
    if (!(await User.exists({ email: u.email }))) {
      await User.create({ ...u, passwordHash: hash });
      log(`  + user ${u.email} (${u.role})`);
    }
  }
  let locs = await Location.find().lean();
  if (locs.length === 0) {
    const admin = await User.findOne({ email: "admin@gmail.com" }).lean();
    let n = 0;
    for (const [name, department, abbr] of LOCATIONS) {
      n++;
      await Location.create({ name, department, code: `GP-${abbr}-${String(n).padStart(3, "0")}`, qrToken: newQrToken(), createdBy: admin?._id });
    }
    locs = await Location.find().lean();
    log(`  + ${LOCATIONS.length} locations (each with its own QR token)`);
  }
  if ((await Standard.countDocuments()) === 0) {
    const id = (name: string) => locs.find((l) => l.name === name)?._id;
    const docs: any[] = CORE.map((s, order) => ({ ...s, order }));
    EXTRA.forEach((s, i) => docs.push({ title: s.title, description: s.description, category: s.category, severity: s.severity, order: CORE.length + i, locations: s.at.map(id).filter(Boolean) }));
    await Standard.insertMany(docs);
    log(`  + ${docs.length} checklist standards (${CORE.length} for every location, ${EXTRA.length} location-specific)`);
  }
}

// ---------------------------------------------------------------------------------------------
// Demo history: realistic past inspections created through the SAME service the inspector uses,
// back-dated so the trend chart, leaderboard, risk alerts and reports are populated.
// It never touches "Main Canteen" and leaves the system fully usable for new real inspections.
// ---------------------------------------------------------------------------------------------
export async function ensureDemoHistory(log = console.log) {
  if ((await Inspection.countDocuments()) > 0) return;
  const inspector = await User.findOne({ email: "inspector@gmail.com" }).lean();
  const staff = await User.findOne({ email: "staff@gmail.com" }).lean();
  const admin = await User.findOne({ email: "admin@gmail.com" }).lean();
  if (!inspector || !staff || !admin) return;
  const who = { id: String(inspector._id), name: inspector.name, email: inspector.email, role: "INSPECTOR" as Role };
  const day = 86400000;

  async function inspect(locName: string, daysAgo: number, failing: string[] = [], na: string[] = []) {
    const loc = await Location.findOne({ name: locName }).lean();
    if (!loc) return null;
    const list = (await Standard.find({ active: true }).lean()).filter((s: any) => !s.locations?.length || s.locations.some((l: any) => String(l) === String(loc._id)));
    const responses = list.map((s: any) => ({
      standardId: String(s._id),
      result: (failing.includes(s.title) ? "NON_COMPLIANT" : na.includes(s.title) ? "NOT_APPLICABLE" : "COMPLIANT") as any,
      remarks: failing.includes(s.title) ? `${s.title} standard was not met during the round.` : "",
      evidenceIds: [],
    }));
    return submitInspection({ qrToken: loc.qrToken, responses, notes: "", }, who, { at: new Date(Date.now() - daysAgo * day) });
  }

  // Library: consistently good
  await inspect("Library", 120); await inspect("Library", 60, ["Plastic Usage"]); await inspect("Library", 6);
  // Boys Hostel: improving
  await inspect("Boys Hostel", 100, ["Waste Segregation", "Water Leakage", "Cleanliness"]); await inspect("Boys Hostel", 45, ["Dustbin Availability", "Washroom Hygiene"]); await inspect("Boys Hostel", 9, ["Washroom Hygiene"]);
  // CSE Block: DECLINING
  await inspect("CSE Block", 80); await inspect("CSE Block", 40, ["Energy Usage"]); const cse = await inspect("CSE Block", 4, ["Energy Usage", "Waste Segregation", "Dustbin Availability"]);
  // ECE Block: REPEATED waste violation + low score
  await inspect("ECE Block", 30, ["Waste Segregation"]); const ece = await inspect("ECE Block", 5, ["Waste Segregation", "Water Leakage", "Cleanliness"]);

  // A realistic mix of issue states
  const all = await Issue.find().populate("location", "name").sort({ createdAt: 1 }).lean();
  let closedCount = 0, i = 0, recentIdx = 0;
  for (const iss of all as any[]) {
    const ageDays = (Date.now() - +new Date(iss.createdAt)) / day;
    const doc = await Issue.findById(iss._id);
    if (!doc) continue;
    i++;
    const at = (d: number) => new Date(+new Date(iss.createdAt) + d * day);
    if (ageDays > 20) {
      // old issues were assigned, fixed and verified
      doc.assignedTo = staff._id as any; doc.assignedBy = admin._id as any; doc.dueDate = at(3);
      doc.history.push({ status: "ASSIGNED", action: `Assigned to ${staff.name}`, byName: admin.name, note: "", at: at(0.2) } as any,
        { status: "IN_PROGRESS", action: "Work started", byName: staff.name, note: "", at: at(0.6) } as any,
        { status: "RESOLVED", action: "Marked resolved by staff", byName: staff.name, note: "Corrected on site.", at: at(1.5) } as any,
        { status: "VERIFICATION_PENDING", action: "Submitted for verification", byName: staff.name, note: "", at: at(1.5) } as any,
        { status: "VERIFIED", action: "Fix verified by inspector", byName: inspector.name, note: "Re-inspected — OK.", at: at(2) } as any,
        { status: "CLOSED", action: "Issue closed", byName: inspector.name, note: "", at: at(2) } as any);
      doc.status = "CLOSED"; doc.closedAt = at(2); doc.verifiedAt = at(2); doc.verifiedBy = inspector._id as any; doc.resolutionRemarks = "Corrected on site.";
      await doc.save();
      await recordImpact({ _id: doc._id, location: doc.location as any, category: doc.category, severity: doc.severity });
      closedCount++;
    } else {
      // Recent issues: mostly on schedule (due in the next few days). Exactly ONE is left overdue and
      // unassigned so the escalation rule has something real to show.
      recentIdx++;
      if (recentIdx > 1) doc.dueDate = new Date(Date.now() + ((recentIdx % 4) + 1) * day);
      if (recentIdx % 3 === 0) {
        doc.assignedTo = staff._id as any; doc.assignedBy = admin._id as any; doc.status = "ASSIGNED";
        doc.history.push({ status: "ASSIGNED", action: `Assigned to ${staff.name}`, byName: admin.name, note: "", at: new Date() } as any);
      }
      await doc.save();
    }
  }
  // back-date the impact records to when the fix happened so the monthly chart has shape
  const { EnvironmentalImpact } = await import("../models");
  for (const rec of await EnvironmentalImpact.find()) {
    const iss = await Issue.findById(rec.issue).lean();
    if (iss?.closedAt) { const d = new Date(iss.closedAt); rec.period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; rec.recordedAt = d; await rec.save(); }
  }
  await notifyUsers([staff._id as Types.ObjectId], { type: "ISSUE_ASSIGNED", title: "Welcome — you have assigned issues", message: "Open your Assigned Issues to get started.", link: "/staff/issues" });
  log(`  + demo history: ${await Inspection.countDocuments()} inspections, ${await Issue.countDocuments()} issues (${closedCount} closed)`);
  void cse; void ece;
}
