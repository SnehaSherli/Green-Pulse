import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { HttpError, appBaseUrl, oid } from "../http";
import { auth } from "../middleware/auth";
import { Location, LOCATION_STATUS, newQrToken } from "../models";
import { locationForAdmin, locationForInspector } from "../services/serializers";
import { checklistFor, resolveQr } from "../services/inspections";

const router = Router();

// ---------- INSPECTOR: resolve a scanned QR -> location (validated against MongoDB) ----------
// The QR token only *identifies* a location. Who may use it is decided by the logged-in role.
router.get("/qr/:token", auth("INSPECTOR"), async (req, res) => {
  const loc = await resolveQr(String(req.params.token)); // 404 unknown token, 409 inactive
  res.json({
    location: locationForInspector(loc),
    inspector: { id: req.user!.id, name: req.user!.name, email: req.user!.email },
    date: new Date().toISOString(),
  });
});

router.get("/qr/:token/checklist", auth("INSPECTOR"), async (req, res) => {
  const loc = await resolveQr(String(req.params.token));
  const items = await checklistFor(loc._id);
  res.json({
    location: locationForInspector(loc),
    checklist: items.map((s: any) => ({ id: String(s._id), title: s.title, description: s.description || "", category: s.category, severity: s.severity })),
  });
});

// ---------- ADMIN: manage locations & their QR codes ----------
router.get("/", auth("ADMIN"), async (req, res) => {
  const list = await Location.find().sort({ createdAt: 1 }).lean();
  res.json(list.map((l) => locationForAdmin(l, req, req.query.base)));
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().default(""),
});

async function nextCode(name: string) {
  const prefix = name.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const n = await Location.countDocuments();
  return `GP-${prefix}-${String(n + 1).padStart(3, "0")}`;
}

router.post("/", auth("ADMIN"), async (req, res) => {
  const b = createSchema.parse(req.body);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const loc = await Location.create({
        ...b,
        code: attempt === 0 ? await nextCode(b.name) : `${await nextCode(b.name)}-${attempt}`,
        qrToken: newQrToken(), // unique, unguessable, stored (and indexed) in MongoDB
        createdBy: req.user!.id,
      });
      res.status(201).json(locationForAdmin(loc.toObject(), req, req.query.base));
      return;
    } catch (e: any) {
      if (e?.code !== 11000) throw e; // duplicate code/token -> retry with a fresh one
    }
  }
  throw new HttpError(500, "Could not allocate a unique location code");
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  department: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  status: z.enum(LOCATION_STATUS).optional(),
});
router.patch("/:id", auth("ADMIN"), async (req, res) => {
  const id = oid(req.params.id, "Location");
  const b = patchSchema.parse(req.body);
  const loc = await Location.findByIdAndUpdate(id, { $set: b }, { new: true }).lean();
  if (!loc) throw new HttpError(404, "Location not found");
  res.json(locationForAdmin(loc, req, req.query.base));
});

// Regenerate: the old token is overwritten, so the old QR immediately stops resolving (404).
router.post("/:id/regenerate-qr", auth("ADMIN"), async (req, res) => {
  const id = oid(req.params.id, "Location");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const loc = await Location.findByIdAndUpdate(id, { $set: { qrToken: newQrToken(), qrGeneratedAt: new Date() }, $inc: { qrVersion: 1 } }, { new: true }).lean();
      if (!loc) throw new HttpError(404, "Location not found");
      res.json(locationForAdmin(loc, req, req.query.base));
      return;
    } catch (e: any) {
      if (e?.code !== 11000) throw e;
    }
  }
  throw new HttpError(500, "Could not generate a unique QR token");
});

// Server-rendered PNG of the QR (used for "Download PNG"). Encodes <base>/inspect/<token>.
router.get("/:id/qr.png", auth("ADMIN"), async (req, res) => {
  const loc = await Location.findById(oid(req.params.id, "Location")).lean();
  if (!loc) throw new HttpError(404, "Location not found");
  const url = `${appBaseUrl(req, req.query.base)}/inspect/${loc.qrToken}`;
  const png = await QRCode.toBuffer(url, { type: "png", width: 720, margin: 2, errorCorrectionLevel: "M" });
  res.set({ "Content-Type": "image/png", "Cache-Control": "no-store" });
  if (req.query.download) res.set("Content-Disposition", `attachment; filename="${loc.code}-qr.png"`);
  res.send(png);
});

export default router;
