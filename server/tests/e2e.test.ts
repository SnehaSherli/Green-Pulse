/**
 * End-to-end tests for GreenPulse: QR -> inspection -> issues -> assignment -> resolution -> verification.
 * Runs the real Express app against a real MongoDB-protocol database (database "greenpulse_test", dropped first).
 *   MONGODB_URI=mongodb://127.0.0.1:27017 npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "net";
import fs from "fs";
import os from "os";
import path from "path";
import { PNG } from "pngjs";
import jsQR from "jsqr";

const base = (process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/x").replace(/\/[^/]*$/, "");
process.env.MONGODB_URI = `${base}/greenpulse_test`;
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gp-uploads-"));
process.env.PUBLIC_APP_URL = "";
const PW = "GreenPulse@123";

type Api = { call: (m: string, p: string, body?: unknown) => Promise<{ status: number; body: any }>; upload: (p: string, fields: Record<string, string>, file: Buffer, name?: string, type?: string) => Promise<{ status: number; body: any }>; raw: (p: string) => Promise<Response> };
let url = "";
let server: import("http").Server;
let mods: { db: typeof import("../src/db"); models: typeof import("../src/models"); app: typeof import("../src/app"); seed: typeof import("../src/services/seed") };
let mongoose: typeof import("mongoose").default;

async function login(email: string, password = PW): Promise<Api & { user: any }> {
  let cookie = "";
  const call = async (method: string, p: string, body?: unknown) => {
    const r = await fetch(url + p, { method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get("set-cookie");
    if (sc && sc.startsWith("gp_token=")) cookie = sc.split(";")[0];
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json, headers: r.headers };
  };
  const res = await call("POST", "/api/auth/login", { email, password });
  const setCookie = (await fetch(url + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).headers.get("set-cookie") || "";
  if (res.status !== 200) return { call, user: null, upload: null as any, raw: null as any } as any;
  assert.match(setCookie, /HttpOnly/i, "auth cookie must be httpOnly");
  const upload = async (p: string, fields: Record<string, string>, file: Buffer, name = "photo.png", type = "image/png") => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    fd.append("file", new Blob([file], { type }), name);
    const r = await fetch(url + p, { method: "POST", headers: { cookie }, body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { call, upload, raw: (p: string) => fetch(url + p, { headers: { cookie } }), user: res.body.user };
}

function png(color = 0x2d) {
  const p = new PNG({ width: 16, height: 16 });
  p.data.fill(color);
  return PNG.sync.write(p);
}

const listen = (app: import("express").Express) =>
  new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });

before(async () => {
  mods = {
    db: await import("../src/db"),
    models: await import("../src/models"),
    app: await import("../src/app"),
    seed: await import("../src/services/seed"),
  };
  mongoose = (await import("mongoose")).default;
  await mods.db.connectDb();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await mods.seed.ensureSeedData(() => undefined);
  await listen(mods.app.createApp());
});
after(async () => {
  server?.close();
  await mongoose.connection.dropDatabase();
  await mods.db.disconnectDb();
});

// shared state across the ordered scenario
const S: any = {};

describe("1. Authentication", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const r = await fetch(url + "/api/locations");
    assert.equal(r.status, 401);
  });
  it("rejects bad credentials", async () => {
    const r = await fetch(url + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@gmail.com", password: "wrong" }) });
    assert.equal(r.status, 401);
  });
  it("logs in the three demo users; role comes from MongoDB (a role sent by the client is ignored)", async () => {
    const r = await fetch(url + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "staff@gmail.com", password: PW, role: "ADMIN" }) });
    assert.equal((await r.json()).user.role, "STAFF");
    S.admin = await login("admin@gmail.com");
    S.insp = await login("inspector@gmail.com");
    S.staff = await login("staff@gmail.com");
    assert.equal(S.admin.user.role, "ADMIN");
    assert.equal(S.insp.user.role, "INSPECTOR");
    assert.equal(S.staff.user.role, "STAFF");
    const me = await S.insp.call("GET", "/api/auth/me");
    assert.equal(me.body.user.email, "inspector@gmail.com");
  });
  it("password hash is never returned", async () => {
    const users = await S.admin.call("GET", "/api/users");
    assert.equal(users.status, 200);
    assert.ok(users.body.every((u: any) => !("passwordHash" in u)));
  });
  it("deactivated users are locked out immediately", async () => {
    const c = await S.admin.call("POST", "/api/users", { name: "Temp Staff", email: "temp@example.com", password: "TempPass123", role: "STAFF" });
    assert.equal(c.status, 201);
    const t = await login("temp@example.com", "TempPass123");
    assert.equal((await t.call("GET", "/api/dashboard/staff")).status, 200);
    await S.admin.call("PATCH", `/api/users/${c.body.id}`, { active: false });
    assert.equal((await t.call("GET", "/api/dashboard/staff")).status, 401);
  });
});

describe("2. Role-based access control", () => {
  it("ADMIN-only APIs return 403 to INSPECTOR and STAFF", async () => {
    for (const who of [S.insp, S.staff]) {
      assert.equal((await who.call("GET", "/api/locations")).status, 403);
      assert.equal((await who.call("GET", "/api/users")).status, 403);
      assert.equal((await who.call("POST", "/api/locations", { name: "Hack", department: "Hack" })).status, 403);
      assert.equal((await who.call("GET", "/api/dashboard/admin")).status, 403);
    }
  });
  it("INSPECTOR-only APIs return 403 to ADMIN and STAFF (inspection is not open to them)", async () => {
    for (const who of [S.admin, S.staff]) {
      assert.equal((await who.call("POST", "/api/inspections", { qrToken: "a".repeat(48), responses: [{ standardId: "x", result: "COMPLIANT" }] })).status, 403);
      assert.equal((await who.call("GET", "/api/issues/queue/verification")).status, 403);
    }
  });
  it("STAFF-only APIs return 403 to ADMIN and INSPECTOR", async () => {
    for (const who of [S.admin, S.insp]) assert.equal((await who.call("POST", "/api/issues/000000000000000000000000/start")).status, 403);
  });
});

describe("3. QR generation", () => {
  it("every seeded location has a unique 192-bit token stored in MongoDB", async () => {
    const list = (await S.admin.call("GET", "/api/locations")).body;
    assert.equal(list.length, 4);
    const tokens = new Set(list.map((l: any) => l.qrToken));
    assert.equal(tokens.size, 4);
    for (const l of list) assert.match(l.qrToken, /^[a-f0-9]{48}$/);
  });
  it("creating a location generates a token; QR path is /inspect/<token>; no sensitive data inside", async () => {
    const r = await S.admin.call("POST", "/api/locations", { name: "Test Canteen", department: "Facilities" });
    assert.equal(r.status, 201);
    S.loc = r.body;
    assert.match(r.body.qrToken, /^[a-f0-9]{48}$/);
    assert.equal(r.body.qrPath, `/inspect/${r.body.qrToken}`);
    assert.ok(r.body.qrUrl.endsWith(`/inspect/${r.body.qrToken}`));
    assert.ok(!r.body.qrUrl.includes(S.loc.id), "ObjectId must not be embedded");
    assert.ok(!r.body.qrUrl.toLowerCase().includes("canteen"), "location name must not be embedded");
    const doc = await mods.models.Location.findOne({ qrToken: r.body.qrToken }).lean();
    assert.equal(String(doc!._id), r.body.id);
  });
  it("the token index is UNIQUE in MongoDB", async () => {
    const idx = await mods.models.Location.collection.indexes();
    assert.ok(idx.some((i: any) => i.key.qrToken === 1 && i.unique), "unique index on qrToken");
    await assert.rejects(() => mods.models.Location.create({ name: "Dup", code: "DUP-1", department: "x", qrToken: S.loc.qrToken }));
  });
  it("server-rendered QR PNG really decodes (jsQR) to the inspection URL of THAT location", async () => {
    const r = await S.admin.raw(`/api/locations/${S.loc.id}/qr.png`);
    assert.equal(r.headers.get("content-type"), "image/png");
    const img = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
    const decoded = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
    assert.ok(decoded, "QR must be decodable");
    assert.equal(decoded!.data, S.loc.qrUrl);
    // a different base (LAN address for the phone) is honoured, path/token unchanged
    const r2 = await S.admin.raw(`/api/locations/${S.loc.id}/qr.png?base=${encodeURIComponent("https://192.168.1.20:5173")}`);
    const img2 = PNG.sync.read(Buffer.from(await r2.arrayBuffer()));
    assert.equal(jsQR(new Uint8ClampedArray(img2.data), img2.width, img2.height)!.data, `https://192.168.1.20:5173/inspect/${S.loc.qrToken}`);
  });
  it("two locations never produce the same QR image content", async () => {
    const list = (await S.admin.call("GET", "/api/locations")).body;
    const urls = new Set(list.map((l: any) => l.qrUrl));
    assert.equal(urls.size, list.length);
  });
  it("QR survives an application restart (token is persisted in MongoDB)", async () => {
    const token = S.loc.qrToken;
    server.close();
    await mods.db.disconnectDb();
    await mods.db.connectDb();
    await listen(mods.app.createApp());
    const r = await S.insp.call("GET", `/api/locations/qr/${token}`); // old session cookie is still valid (stateless JWT)
    assert.equal(r.status, 200);
    assert.equal(r.body.location.name, "Test Canteen");
  });
});

describe("4. QR scanning / resolution", () => {
  it("valid token: backend finds the location in MongoDB and returns it (plus logged-in inspector + date)", async () => {
    const r = await S.insp.call("GET", `/api/locations/qr/${S.loc.qrToken}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.location.name, "Test Canteen");
    assert.equal(r.body.location.id, S.loc.id);
    assert.equal(r.body.inspector.email, "inspector@gmail.com");
    assert.ok(!("qrToken" in r.body.location));
  });
  it("invalid tokens -> 404 Location not found, and the server stays healthy", async () => {
    for (const t of ["deadbeef".repeat(6), "not-a-token", "..%2F..%2Fetc%2Fpasswd", "a".repeat(5000), "%00"]) {
      const r = await S.insp.call("GET", `/api/locations/qr/${t}`);
      assert.equal(r.status, 404, `token ${t.slice(0, 20)}`);
    }
    assert.equal((await fetch(url + "/api/healthz")).status, 200);
  });
  it("QR does not grant authorization: STAFF and ADMIN get 403, anonymous gets 401", async () => {
    assert.equal((await S.staff.call("GET", `/api/locations/qr/${S.loc.qrToken}`)).status, 403);
    assert.equal((await S.admin.call("GET", `/api/locations/qr/${S.loc.qrToken}`)).status, 403);
    assert.equal((await fetch(url + `/api/locations/qr/${S.loc.qrToken}`)).status, 401);
    assert.equal((await S.staff.call("GET", `/api/locations/qr/${S.loc.qrToken}/checklist`)).status, 403);
  });
  it("inactive location is rejected (409 'Location is inactive.')", async () => {
    const r = await S.admin.call("POST", "/api/locations", { name: "Closed Wing", department: "Ops" });
    await S.admin.call("PATCH", `/api/locations/${r.body.id}`, { status: "inactive" });
    const scan = await S.insp.call("GET", `/api/locations/qr/${r.body.qrToken}`);
    assert.equal(scan.status, 409);
    assert.equal(scan.body.error, "Location is inactive.");
    const sub = await S.insp.call("POST", "/api/inspections", { qrToken: r.body.qrToken, responses: [{ standardId: "x", result: "COMPLIANT" }] });
    assert.equal(sub.status, 409);
  });
  it("regenerating the QR invalidates the old token", async () => {
    const r = await S.admin.call("POST", "/api/locations", { name: "Regen Hall", department: "Ops" });
    const old = r.body.qrToken;
    const g = await S.admin.call("POST", `/api/locations/${r.body.id}/regenerate-qr`);
    assert.equal(g.status, 200);
    assert.notEqual(g.body.qrToken, old);
    assert.equal(g.body.qrVersion, 2);
    assert.equal((await S.insp.call("GET", `/api/locations/qr/${old}`)).status, 404);
    assert.equal((await S.insp.call("POST", "/api/inspections", { qrToken: old, responses: [{ standardId: "x", result: "COMPLIANT" }] })).status, 404);
    assert.equal((await S.insp.call("GET", `/api/locations/qr/${g.body.qrToken}`)).status, 200);
  });
});

describe("5. Checklist comes from MongoDB", () => {
  it("returns all active applicable standards; location-specific standards only appear where they apply", async () => {
    const r = await S.insp.call("GET", `/api/locations/qr/${S.loc.qrToken}/checklist`);
    assert.equal(r.status, 200);
    S.checklist = r.body.checklist;
    assert.equal(S.checklist.length, 5, "a new location gets the 5 core items");
    
    const other = (await S.admin.call("GET", "/api/locations")).body.find((l: any) => l.name === "Library");
    const add = await S.admin.call("POST", "/api/standards", { title: "Canteen grease trap cleaned", category: "cleanliness", severity: "high", locations: [S.loc.id] });
    assert.equal(add.status, 201);
    const mine = (await S.insp.call("GET", `/api/locations/qr/${S.loc.qrToken}/checklist`)).body.checklist;
    const theirs = (await S.insp.call("GET", `/api/locations/qr/${other.qrToken}/checklist`)).body.checklist;
    assert.equal(mine.length, 6);
    assert.equal(theirs.length, 7, "Library = 5 core + 2 location-specific");
    S.checklist = mine;
  });
});

describe("6. Evidence upload (BEFORE)", () => {
  it("accepts an image from an inspector and stores metadata in MongoDB", async () => {
    const r = await S.insp.upload("/api/evidence", { type: "BEFORE", locationId: S.loc.id, caption: "mixed waste" }, png(0x40));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    S.beforeA = r.body;
    const doc: any = await mods.models.Evidence.findById(r.body.id).lean();
    assert.equal(doc.type, "BEFORE");
    assert.equal(String(doc.location), S.loc.id);
    assert.equal(String(doc.uploadedBy), S.insp.user.id);
    assert.ok(doc.createdAt);
    assert.ok(fs.existsSync(path.join(process.env.UPLOAD_DIR!, doc.fileName)));
    const file = await S.insp.raw(r.body.url);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get("content-type"), "image/png");
  });
  it("rejects non-images (even with a fake image mime type) and staff BEFORE uploads", async () => {
    const fake = await S.insp.upload("/api/evidence", { type: "BEFORE", locationId: S.loc.id }, Buffer.from("<script>alert(1)</script>"), "x.png", "image/png");
    assert.equal(fake.status, 400);
    const wrongMime = await S.insp.upload("/api/evidence", { type: "BEFORE", locationId: S.loc.id }, Buffer.from("hello"), "x.txt", "text/plain");
    assert.equal(wrongMime.status, 400);
    assert.equal((await S.staff.upload("/api/evidence", { type: "BEFORE", locationId: S.loc.id }, png())).status, 403);
    assert.equal((await S.admin.upload("/api/evidence", { type: "BEFORE", locationId: S.loc.id }, png())).status, 403);
    assert.equal(fs.readdirSync(process.env.UPLOAD_DIR!).length, 1, "rejected files must not stay on disk");
  });
  it("anonymous users cannot download evidence", async () => {
    assert.equal((await fetch(url + S.beforeA.url)).status, 401);
  });
});

describe("7. Submit inspection: score, issues, severity, evidence linking", () => {
  const answer = (over: Record<string, any>) => S.checklist.map((c: any) => ({ standardId: c.id, result: "COMPLIANT", ...(over[c.title] || {}) }));
  it("validates: every item must be answered; Non-Compliant needs remarks; unknown/duplicate items rejected", async () => {
    const all = answer({});
    assert.equal((await S.insp.call("POST", "/api/inspections", { qrToken: S.loc.qrToken, responses: all.slice(1) })).status, 400);
    const noRemarks = answer({ "Waste Segregation": { result: "NON_COMPLIANT" } });
    assert.equal((await S.insp.call("POST", "/api/inspections", { qrToken: S.loc.qrToken, responses: noRemarks })).status, 400);
    assert.equal((await S.insp.call("POST", "/api/inspections", { qrToken: S.loc.qrToken, responses: [...all, all[0]] })).status, 400);
    const allNA = answer({}).map((r: any) => ({ ...r, result: "NOT_APPLICABLE" }));
    assert.equal((await S.insp.call("POST", "/api/inspections", { qrToken: S.loc.qrToken, responses: allNA })).status, 400, "no applicable items -> no score");
    assert.equal(await mods.models.Inspection.countDocuments(), 0, "failed submissions must not persist anything");
  });
  it("cannot attach someone else's / already-used / wrong-type evidence", async () => {
    const other = await S.admin.call("POST", "/api/users", { name: "Second Inspector", email: "inspector2@gmail.com", password: "Inspector123", role: "INSPECTOR" });
    assert.equal(other.status, 201);
    S.insp2 = await login("inspector2@gmail.com", "Inspector123");
    const r = answer({ "Waste Segregation": { result: "NON_COMPLIANT", remarks: "mixed", evidenceIds: [S.beforeA.id] } });
    const s = await S.insp2.call("POST", "/api/inspections", { qrToken: S.loc.qrToken, responses: r });
    assert.equal(s.status, 400, "inspector2 must not be able to use inspector1's photo");
    const onCompliant = answer({ "Cleanliness": { evidenceIds: [S.beforeA.id] } });
    assert.equal((await S.insp.call("POST", "/api/inspections", { qrToken: S.loc.qrToken, responses: onCompliant })).status, 400);
  });
  it("6 items: 1 N/A + 2 Non-Compliant + 3 Compliant -> score 3/5 = 60% (N/A excluded from the denominator)", async () => {
    // add a second before photo for the 2nd failed item
    const b2 = await S.insp.upload("/api/evidence", { type: "BEFORE", locationId: S.loc.id }, png(0x90));
    const responses = answer({
      "Cleanliness": { result: "NOT_APPLICABLE" },
      "Waste Segregation": { result: "NON_COMPLIANT", remarks: "Wet and dry waste are mixed.", evidenceIds: [S.beforeA.id] },
      "Water Leakage": { result: "NON_COMPLIANT", remarks: "Tap under sink is leaking.", evidenceIds: [b2.body.id] },
    });
    const r = await S.insp.call("POST", "/api/inspections", { qrToken: S.loc.qrToken, responses, notes: "Morning round" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const i = r.body.inspection;
    assert.equal(i.applicable, 5);
    assert.equal(i.compliant, 3);
    assert.equal(i.nonCompliant, 2);
    assert.equal(i.notApplicable, 1);
    assert.equal(i.score, 60);
    assert.equal(i.result, "needs_action");
    assert.equal(i.inspector.name, S.insp.user.name);
    S.inspection1 = i;
    // issues
    assert.equal(r.body.issues.length, 2);
    const byTitle = Object.fromEntries(r.body.issues.map((x: any) => [x.title, x]));
    assert.equal(byTitle["Waste Segregation"].severity, "high");
    assert.equal(byTitle["Water Leakage"].severity, "high");
    assert.equal(byTitle["Water Leakage"].status, "REPORTED");
    assert.match(byTitle["Waste Segregation"].recommendation, /segregation bins/i);
    assert.match(byTitle["Water Leakage"].recommendation, /leakage|plumbing/i);
    assert.equal(byTitle["Waste Segregation"].isRepeated, false);
    S.issueWaste = byTitle["Waste Segregation"];
    S.issueWater = byTitle["Water Leakage"];
    // persisted in MongoDB
    assert.equal(await mods.models.ChecklistResponse.countDocuments({ inspection: i.id }), 6);
    assert.equal(await mods.models.Issue.countDocuments({ inspection: i.id }), 2);
    // evidence linked to inspection + response + issue, uploader, type, timestamp
    const ev: any = await mods.models.Evidence.findById(S.beforeA.id).lean();
    assert.equal(String(ev.inspection), i.id);
    assert.equal(String(ev.issue), S.issueWaste.id);
    assert.ok(ev.response);
    assert.equal(String(ev.uploadedBy), S.insp.user.id);
    assert.equal(ev.type, "BEFORE");
    // location updated
    const loc: any = await mods.models.Location.findById(S.loc.id).lean();
    assert.equal(loc.latestScore, 60);
    // evidence can't be re-used by another inspection
    const again = await S.insp.call("POST", "/api/inspections", { qrToken: S.loc.qrToken, responses: answer({ "Waste Segregation": { result: "NON_COMPLIANT", remarks: "x1", evidenceIds: [S.beforeA.id] } }) });
    assert.equal(again.status, 400);
  });
  it("admin got notified about the new issues; inspection is visible to admin and owner only", async () => {
    const n = await S.admin.call("GET", "/api/notifications");
    assert.ok(n.body.items.some((x: any) => x.type === "ISSUE_CREATED"));
    assert.equal((await S.admin.call("GET", `/api/inspections/${S.inspection1.id}`)).status, 200);
    const d = await S.insp.call("GET", `/api/inspections/${S.inspection1.id}`);
    assert.equal(d.status, 200);
    const withEv = d.body.responses.find((r: any) => r.standardTitle === "Waste Segregation");
    assert.equal(withEv.evidence.length, 1);
    assert.equal((await S.insp2.call("GET", `/api/inspections/${S.inspection1.id}`)).status, 403);
    assert.equal((await S.staff.call("GET", `/api/inspections/${S.inspection1.id}`)).status, 403);
  });
});

describe("8. Repeated violation & risk rules", () => {
  it("failing the same standard again within 60 days flags a repeat, escalates severity, and raises risk flags", async () => {
    const responses = S.checklist.map((c: any) => ({
      standardId: c.id,
      result: ["Waste Segregation", "Water Leakage", "Cleanliness", "Dustbin Availability"].includes(c.title) ? "NON_COMPLIANT" : "COMPLIANT",
      remarks: "still bad",
    }));
    const r = await S.insp.call("POST", "/api/inspections", { qrToken: S.loc.qrToken, responses });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const i = r.body.inspection;
    assert.equal(i.score, 33.3); // 2/6
    const waste = r.body.issues.find((x: any) => x.title === "Waste Segregation");
    assert.equal(waste.isRepeated, true);
    assert.equal(waste.repeatCount, 1);
    assert.equal(waste.severity, "critical", "high -> critical after a repeat");
    const bins = r.body.issues.find((x: any) => x.title === "Dustbin Availability");
    assert.equal(bins.isRepeated, false);
    assert.equal(bins.severity, "medium");
    const types = i.riskFlags.map((f: any) => f.type);
    assert.ok(types.includes("REPEATED_VIOLATION"));
    assert.ok(types.includes("DECLINING_SCORE"), "60 -> 33.3 is a >=10 point drop");
    assert.ok(i.recommendations.some((x: string) => /Waste:/.test(x)) && i.recommendations.some((x: string) => /Water:/.test(x)) && i.recommendations.some((x: string) => /Cleanliness:/.test(x)));
    S.repeatIssueIds = r.body.issues.map((x: any) => x.id);
  });
  it("low score creates a LOW_SCORE risk (<60 = high)", async () => {
    const responses = S.checklist.map((c: any, idx: number) => ({ standardId: c.id, result: idx < 5 ? "NON_COMPLIANT" : "COMPLIANT", remarks: "bad" }));
    const r = await S.insp.call("POST", "/api/inspections", { qrToken: S.loc.qrToken, responses });
    assert.equal(r.body.inspection.score, 16.7);
    assert.ok(r.body.inspection.riskFlags.some((f: any) => f.type === "LOW_SCORE" && f.level === "high"));
    const admin = (await S.admin.call("GET", "/api/dashboard/admin")).body;
    assert.ok(admin.risks.some((x: any) => x.type === "LOW_SCORE" && x.location === "Test Canteen"));
    assert.ok(admin.risks.some((x: any) => x.type === "REPEATED_VIOLATION"));
    assert.ok(admin.recommendations.length > 0);
    assert.equal(admin.summary.highRiskLocations, 1);
  });
});

describe("9. Admin assigns -> Staff resolves -> Inspector verifies", () => {
  it("STAFF sees nothing until assigned; ADMIN assigns; STAFF sees only their own issues", async () => {
    assert.equal((await S.staff.call("GET", "/api/issues")).body.length, 0);
    S.staff2 = (await S.admin.call("POST", "/api/users", { name: "Other Staff", email: "staff2@gmail.com", password: "StaffPass123", role: "STAFF" })).body;
    S.staff2c = await login("staff2@gmail.com", "StaffPass123");
    // assign to inspector (not staff) must fail
    const bad = await S.admin.call("POST", `/api/issues/${S.issueWaste.id}/assign`, { staffId: S.insp.user.id });
    assert.equal(bad.status, 400);
    const ok = await S.admin.call("POST", `/api/issues/${S.issueWaste.id}/assign`, { staffId: S.staff.user.id });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, "ASSIGNED");
    assert.equal(ok.body.assignedTo.id, S.staff.user.id);
    assert.ok(ok.body.dueDate);
    const mine = await S.staff.call("GET", "/api/issues");
    assert.deepEqual(mine.body.map((x: any) => x.id), [S.issueWaste.id]);
    assert.equal((await S.staff2c.call("GET", "/api/issues")).body.length, 0);
    assert.equal((await S.staff2c.call("GET", `/api/issues/${S.issueWaste.id}`)).status, 404, "other staff cannot open it");
    assert.equal((await S.staff2c.call("POST", `/api/issues/${S.issueWaste.id}/start`)).status, 404);
    const note = await S.staff.call("GET", "/api/notifications");
    assert.ok(note.body.items.some((n: any) => n.type === "ISSUE_ASSIGNED"));
  });
  it("cannot skip steps: AFTER photo needs In Progress; submit needs evidence + remarks", async () => {
    const id = S.issueWaste.id;
    assert.equal((await S.staff.upload("/api/evidence", { type: "AFTER", issueId: id }, png())).status, 409, "must start first");
    assert.equal((await S.staff.call("POST", `/api/issues/${id}/submit`, { resolutionRemarks: "done done" })).status, 409);
    assert.equal((await S.staff.call("POST", `/api/issues/${id}/start`)).status, 200);
    assert.equal((await S.staff.call("POST", `/api/issues/${id}/note`, { note: "Bins ordered" })).status, 200);
    assert.equal((await S.staff.call("POST", `/api/issues/${id}/submit`, { resolutionRemarks: "Separated bins installed" })).status, 400, "no after photo yet");
    assert.equal((await S.staff2c.upload("/api/evidence", { type: "AFTER", issueId: id }, png())).status, 404, "other staff cannot upload");
    assert.equal((await S.insp.upload("/api/evidence", { type: "AFTER", issueId: id }, png())).status, 403);
    const up = await S.staff.upload("/api/evidence", { type: "AFTER", issueId: id, caption: "new bins" }, png(0xc0));
    assert.equal(up.status, 201, JSON.stringify(up.body));
    S.after1 = up.body;
    assert.equal((await S.staff.call("POST", `/api/issues/${id}/submit`, { resolutionRemarks: "" })).status, 400, "remarks required");
    const sub = await S.staff.call("POST", `/api/issues/${id}/submit`, { resolutionRemarks: "Installed labelled wet/dry bins and briefed the staff." });
    assert.equal(sub.status, 200);
    assert.equal(sub.body.status, "VERIFICATION_PENDING");
    // locked after submit
    assert.equal((await S.staff.call("DELETE", `/api/evidence/${up.body.id}`)).status, 409);
    assert.equal((await S.staff.call("POST", `/api/issues/${id}/submit`, { resolutionRemarks: "again please" })).status, 409);
  });
  it("INSPECTOR verification queue shows before AND after evidence; STAFF/ADMIN cannot verify", async () => {
    const q = await S.insp.call("GET", "/api/issues/queue/verification");
    assert.equal(q.status, 200);
    assert.deepEqual(q.body.map((x: any) => x.id), [S.issueWaste.id]);
    const d = (await S.insp.call("GET", `/api/issues/${S.issueWaste.id}`)).body;
    assert.deepEqual(d.evidence.map((e: any) => e.type).sort(), ["AFTER", "BEFORE"]);
    for (const e of d.evidence) assert.equal((await S.insp.raw(e.url)).status, 200);
    assert.equal((await S.staff.call("POST", `/api/issues/${S.issueWaste.id}/verify`, { decision: "APPROVE" })).status, 403);
    assert.equal((await S.admin.call("POST", `/api/issues/${S.issueWaste.id}/verify`, { decision: "APPROVE" })).status, 403);
    assert.equal((await S.staff.call("GET", "/api/issues/queue/verification")).status, 403);
  });
  it("REJECT needs remarks, returns the issue to IN_PROGRESS, and demands fresh AFTER evidence", async () => {
    const id = S.issueWaste.id;
    assert.equal((await S.insp.call("POST", `/api/issues/${id}/verify`, { decision: "REJECT" })).status, 400);
    const rej = await S.insp.call("POST", `/api/issues/${id}/verify`, { decision: "REJECT", remarks: "Bins are not labelled yet." });
    assert.equal(rej.status, 200);
    assert.equal(rej.body.status, "IN_PROGRESS");
    assert.equal(rej.body.rejectionRemarks, "Bins are not labelled yet.");
    assert.equal(rej.body.rejectionCount, 1);
    const n = await S.staff.call("GET", "/api/notifications");
    assert.ok(n.body.items.some((x: any) => x.type === "ISSUE_REJECTED"));
    assert.equal((await S.staff.call("POST", `/api/issues/${id}/submit`, { resolutionRemarks: "Labelled bins now" })).status, 400, "the old after-photo doesn't count for round 2");
    assert.equal((await S.staff.upload("/api/evidence", { type: "AFTER", issueId: id }, png(0xe0))).status, 201);
    assert.equal((await S.staff.call("POST", `/api/issues/${id}/submit`, { resolutionRemarks: "Labels added to every bin." })).status, 200);
  });
  it("APPROVE closes the issue and records environmental impact", async () => {
    const id = S.issueWaste.id;
    const ok = await S.insp.call("POST", `/api/issues/${id}/verify`, { decision: "APPROVE", remarks: "Looks good" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, "CLOSED");
    assert.ok(ok.body.closedAt);
    assert.equal(ok.body.verifiedBy.name, S.insp.user.name);
    assert.deepEqual(ok.body.history.map((h: any) => h.status), ["REPORTED", "ASSIGNED", "IN_PROGRESS", "IN_PROGRESS", "RESOLVED", "VERIFICATION_PENDING", "IN_PROGRESS", "RESOLVED", "VERIFICATION_PENDING", "VERIFIED", "CLOSED"]);
    assert.equal((await S.insp.call("POST", `/api/issues/${id}/verify`, { decision: "APPROVE" })).status, 409, "cannot verify twice");
    assert.equal(await mods.models.EnvironmentalImpact.countDocuments({ issue: id }), 1);
    const impact = (await S.admin.call("GET", "/api/impact")).body;
    assert.equal(impact.totals.issuesClosed, 1);
    assert.ok(impact.totals.wasteRecycledKg > 0);
  });
  it("admin cannot bypass the workflow (no free status change endpoint) and cannot assign closed issues", async () => {
    assert.equal((await S.admin.call("PATCH", `/api/issues/${S.issueWater.id}/status`, { status: "CLOSED" })).status, 404);
    assert.equal((await S.admin.call("POST", `/api/issues/${S.issueWaste.id}/assign`, { staffId: S.staff.user.id })).status, 409);
  });
});

describe("10. Dashboards & reports use live MongoDB data", () => {
  it("admin dashboard numbers equal what is in the database", async () => {
    const d = (await S.admin.call("GET", "/api/dashboard/admin")).body;
    assert.equal(d.summary.totalInspections, await mods.models.Inspection.countDocuments());
    assert.equal(d.summary.resolvedIssues, await mods.models.Issue.countDocuments({ status: "CLOSED" }));
    assert.equal(d.summary.openIssues, await mods.models.Issue.countDocuments({ status: { $ne: "CLOSED" } }));
    assert.equal(d.summary.overallScore, 16.7, "only Test Canteen has a score (latest = 16.7)");
    assert.equal(d.trends.length, 6);
    assert.equal(d.trends[5].inspections, 3);
    const waste = d.categories.find((c: any) => c.category === "waste");
    assert.ok(waste.checks > 0);
    assert.equal(d.leaderboard[0].location, "Test Canteen");
  });
  it("inspector and staff dashboards", async () => {
    const i = (await S.insp.call("GET", "/api/dashboard/inspector")).body;
    assert.equal(i.totalInspections, 3);
    const s = (await S.staff.call("GET", "/api/dashboard/staff")).body;
    assert.equal(s.closed, 1);
  });
  it("report summary + CSV export", async () => {
    const r = (await S.admin.call("GET", "/api/reports/summary?period=month")).body;
    assert.equal(r.inspections, 3);
    assert.equal(r.issuesClosed, 1);
    const csv = await S.admin.raw("/api/reports/issues.csv?period=month");
    assert.match(await csv.text(), /Waste Segregation/);
    assert.equal((await S.staff.call("GET", "/api/reports/summary")).status, 403);
  });
  it("overdue issues are escalated automatically", async () => {
    await mods.models.Issue.updateOne({ _id: S.issueWater.id }, { $set: { dueDate: new Date(Date.now() - 3600_000) } });
    const list = (await S.admin.call("GET", "/api/issues")).body;
    const w = list.find((x: any) => x.id === S.issueWater.id);
    assert.equal(w.escalated, true);
    assert.equal(w.overdue, true);
    const d = (await S.admin.call("GET", "/api/dashboard/admin")).body;
    assert.ok(d.risks.some((x: any) => x.type === "ESCALATION"));
  });
});

describe("11. The exact college-demo scenario (Main Canteen)", () => {
  const dash = async () => (await S.admin.call("GET", "/api/dashboard/admin")).body.summary;
  it("create Main Canteen -> scan -> 4/5 = 80% -> waste issue -> assign -> resolve -> verify -> CLOSED -> dashboard moves", async () => {
    const before = await dash();
    const created = await S.admin.call("POST", "/api/locations", { name: "Main Canteen", department: "Facilities" });
    assert.equal(created.status, 201);
    const token = created.body.qrToken;

    // inspector "scans" the QR: the backend resolves the token against MongoDB
    const scan = await S.insp.call("GET", `/api/locations/qr/${token}`);
    assert.equal(scan.body.location.name, "Main Canteen");
    const cl = (await S.insp.call("GET", `/api/locations/qr/${token}/checklist`)).body.checklist;
    assert.deepEqual(cl.map((c: any) => c.title), ["Cleanliness", "Waste Segregation", "Dustbin Availability", "Water Leakage", "Washroom Hygiene"]);

    const ev = await S.insp.upload("/api/evidence", { type: "BEFORE", locationId: created.body.id }, png(0x33));
    const responses = cl.map((c: any) => c.title === "Waste Segregation"
      ? { standardId: c.id, result: "NON_COMPLIANT", remarks: "Wet and dry waste are mixed.", evidenceIds: [ev.body.id] }
      : { standardId: c.id, result: "COMPLIANT" });
    const sub = await S.insp.call("POST", "/api/inspections", { qrToken: token, responses });
    assert.equal(sub.status, 201, JSON.stringify(sub.body));
    assert.equal(sub.body.inspection.score, 80);
    assert.equal(sub.body.issues.length, 1);
    const issue = sub.body.issues[0];
    assert.equal(issue.title, "Waste Segregation");
    assert.equal(issue.severity, "high");
    assert.equal(issue.location.name, "Main Canteen");

    const mid = await dash();
    assert.equal(mid.totalInspections, before.totalInspections + 1);
    assert.equal(mid.openIssues, before.openIssues + 1);

    assert.equal((await S.admin.call("POST", `/api/issues/${issue.id}/assign`, { staffId: S.staff.user.id })).status, 200);
    const mine = (await S.staff.call("GET", "/api/issues")).body;
    assert.ok(mine.some((x: any) => x.id === issue.id && x.title === "Waste Segregation" && x.location.name === "Main Canteen"));
    await S.staff.call("POST", `/api/issues/${issue.id}/start`);
    assert.equal((await S.staff.upload("/api/evidence", { type: "AFTER", issueId: issue.id }, png(0xaa))).status, 201);
    const res = await S.staff.call("POST", `/api/issues/${issue.id}/submit`, { resolutionRemarks: "Wet and dry waste bins were arranged separately." });
    assert.equal(res.body.status, "VERIFICATION_PENDING");
    const q = (await S.insp.call("GET", "/api/issues/queue/verification")).body;
    assert.ok(q.some((x: any) => x.id === issue.id));
    const det = (await S.insp.call("GET", `/api/issues/${issue.id}`)).body;
    assert.equal(det.resolutionRemarks, "Wet and dry waste bins were arranged separately.");
    assert.deepEqual(det.evidence.map((e: any) => e.type).sort(), ["AFTER", "BEFORE"]);
    const done = await S.insp.call("POST", `/api/issues/${issue.id}/verify`, { decision: "APPROVE", remarks: "Verified on site" });
    assert.equal(done.body.status, "CLOSED");

    const after = await dash();
    assert.equal(after.openIssues, before.openIssues, "open count back down");
    assert.equal(after.resolvedIssues, before.resolvedIssues + 1);
    assert.equal(after.totalInspections, before.totalInspections + 1);
    assert.equal(after.totalLocations, before.totalLocations + 1);
  });
});
