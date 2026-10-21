import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError } from "../http";
import { User, publicUser } from "../models";
import { authenticate, clearAuthCookie, setAuthCookie, signToken } from "../middleware/auth";

const router = Router();

// tiny in-memory brute-force guard: 10 failures / 15 min per ip+email
const failures = new Map<string, { n: number; until: number }>();
const key = (ip: string | undefined, email: string) => `${ip}|${email}`;

const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

router.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const k = key(req.ip, email.toLowerCase());
  const f = failures.get(k);
  if (f && f.n >= 10 && f.until > Date.now()) throw new HttpError(429, "Too many failed attempts. Try again in a few minutes.", "RATE_LIMITED");

  // NOTE: no role is accepted from the client. The role comes from the user document in MongoDB.
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !ok) {
    failures.set(k, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60000 });
    throw new HttpError(401, "Invalid email or password", "BAD_CREDENTIALS");
  }
  failures.delete(k);
  user.lastLoginAt = new Date();
  await user.save();
  setAuthCookie(res, signToken(String(user._id)));
  res.json({ user: publicUser(user) });
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", authenticate, async (req, res) => {
  const u = await User.findById(req.user!.id).lean();
  res.json({ user: publicUser(u!) });
});

export default router;
