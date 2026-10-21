import { Router } from "express";
import { z } from "zod";
import { HttpError, oid } from "../http";
import { auth } from "../middleware/auth";
import { CATEGORIES, SEVERITIES, Standard } from "../models";

const router = Router();
router.use(auth("ADMIN"));

const out = (s: any) => ({
  id: String(s._id), title: s.title, description: s.description || "", category: s.category, severity: s.severity,
  active: s.active, order: s.order, locations: (s.locations || []).map(String),
});

router.get("/", async (_req, res) => {
  const list = await Standard.find().sort({ order: 1, createdAt: 1 }).lean();
  res.json(list.map(out));
});

const base = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(500).optional().default(""),
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES).default("medium"),
  locations: z.array(z.string()).optional().default([]),
  active: z.boolean().optional().default(true),
});

router.post("/", async (req, res) => {
  const b = base.parse(req.body);
  const order = await Standard.countDocuments();
  const s = await Standard.create({ ...b, locations: b.locations.map((l) => oid(l, "Location")), order });
  res.status(201).json(out(s.toObject()));
});

router.patch("/:id", async (req, res) => {
  const b = base.partial().parse(req.body);
  const set: any = { ...b };
  if (b.locations) set.locations = b.locations.map((l) => oid(l, "Location"));
  const s = await Standard.findByIdAndUpdate(oid(req.params.id, "Standard"), { $set: set }, { new: true }).lean();
  if (!s) throw new HttpError(404, "Standard not found");
  res.json(out(s));
});

export default router;
