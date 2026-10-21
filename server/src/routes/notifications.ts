import { Router } from "express";
import { auth } from "../middleware/auth";
import { HttpError, oid } from "../http";
import { Notification } from "../models";

const router = Router();
router.use(auth()); // any signed-in role — but strictly the caller's own notifications

const out = (n: any) => ({ id: String(n._id), type: n.type, title: n.title, message: n.message, link: n.link, read: n.read, createdAt: n.createdAt });

router.get("/", async (req, res) => {
  const list = await Notification.find({ user: req.user!.id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ unread: list.filter((n) => !n.read).length, items: list.map(out) });
});
router.post("/read-all", async (req, res) => {
  await Notification.updateMany({ user: req.user!.id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
});
router.patch("/:id/read", async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: oid(req.params.id, "Notification"), user: req.user!.id }, { $set: { read: true } }, { new: true }).lean();
  if (!n) throw new HttpError(404, "Notification not found");
  res.json(out(n));
});

export default router;
