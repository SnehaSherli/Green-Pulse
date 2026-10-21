import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError, oid } from "../http";
import { auth } from "../middleware/auth";
import { ROLES, User, publicUser } from "../models";

const router = Router();
router.use(auth("ADMIN"));

router.get("/", async (_req, res) => {
  const users = await User.find().sort({ createdAt: 1 }).lean();
  res.json(users.map(publicUser));
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(100),
  role: z.enum(ROLES),
});
router.post("/", async (req, res) => {
  const b = createSchema.parse(req.body);
  if (await User.exists({ email: b.email.toLowerCase() })) throw new HttpError(409, "A user with this email already exists", "DUPLICATE");
  const u = await User.create({ name: b.name, email: b.email, role: b.role, passwordHash: await bcrypt.hash(b.password, 10) });
  res.status(201).json(publicUser(u));
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(100).optional(),
});
router.patch("/:id", async (req, res) => {
  const id = oid(req.params.id, "User");
  const b = patchSchema.parse(req.body);
  const u = await User.findById(id);
  if (!u) throw new HttpError(404, "User not found");
  const self = String(u._id) === req.user!.id;
  if (self && ((b.role && b.role !== u.role) || b.active === false)) throw new HttpError(400, "You cannot change your own role or deactivate yourself", "SELF_CHANGE");
  if ((b.role && b.role !== "ADMIN" && u.role === "ADMIN") || (b.active === false && u.role === "ADMIN")) {
    if ((await User.countDocuments({ role: "ADMIN", active: true })) <= 1) throw new HttpError(400, "At least one active admin is required", "LAST_ADMIN");
  }
  if (b.name) u.name = b.name;
  if (b.role) u.role = b.role;
  if (b.active !== undefined) u.active = b.active;
  if (b.password) u.passwordHash = await bcrypt.hash(b.password, 10);
  await u.save();
  res.json(publicUser(u));
});

export default router;
