import { Router } from "express";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { config } from "../config";
import { HttpError, isId, oid } from "../http";
import { auth } from "../middleware/auth";
import { looksLikeImage, removeFile, upload } from "../middleware/upload";
import { Evidence, Issue, Location } from "../models";
import { evidenceOut } from "../services/serializers";

const router = Router();

const bodySchema = z.object({
  type: z.enum(["BEFORE", "AFTER"]),
  locationId: z.string().optional(),
  issueId: z.string().optional(),
  caption: z.string().max(300).optional().default(""),
});

// Auth + role run BEFORE the file is accepted. INSPECTOR uploads BEFORE, STAFF uploads AFTER.
router.post("/", auth("INSPECTOR", "STAFF"), upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, "No image received (field name must be “file”)", "NO_FILE");
  try {
    if (!looksLikeImage(file.path)) throw new HttpError(400, "File content is not a valid JPEG/PNG/WebP image", "BAD_FILE_TYPE");
    const b = bodySchema.parse(req.body);
    const user = req.user!;
    let doc;

    if (b.type === "BEFORE") {
      if (user.role !== "INSPECTOR") throw new HttpError(403, "Only inspectors can upload BEFORE evidence", "FORBIDDEN");
      const loc = await Location.findById(oid(b.locationId, "Location")).lean();
      if (!loc) throw new HttpError(404, "Location not found", "LOCATION_NOT_FOUND");
      if (loc.status !== "active") throw new HttpError(409, "Location is inactive.", "LOCATION_INACTIVE");
      doc = await Evidence.create({ type: "BEFORE", location: loc._id, uploadedBy: user.id, fileName: file.filename, originalName: file.originalname, mimeType: file.mimetype, size: file.size, caption: b.caption });
    } else {
      if (user.role !== "STAFF") throw new HttpError(403, "Only assigned staff can upload AFTER evidence", "FORBIDDEN");
      const issue = await Issue.findById(oid(b.issueId, "Issue"));
      if (!issue || String(issue.assignedTo) !== user.id) throw new HttpError(404, "Issue not found", "NOT_FOUND"); // don't reveal other staff's issues
      if (issue.status !== "IN_PROGRESS") throw new HttpError(409, "Start work on the issue (In Progress) before uploading after-evidence", "BAD_STATE");
      doc = await Evidence.create({
        type: "AFTER", location: issue.location, inspection: issue.inspection, response: issue.response, issue: issue._id, uploadedBy: user.id,
        round: issue.rejectionCount, fileName: file.filename, originalName: file.originalname, mimeType: file.mimetype, size: file.size, caption: b.caption,
      });
    }
    res.status(201).json(evidenceOut(doc.toObject()));
  } catch (e) {
    removeFile(file.filename); // never keep files that failed validation
    throw e;
  }
});

// Files are served only to authenticated users who are allowed to see that evidence.
router.get("/:id/file", auth(), async (req, res) => {
  const ev = await Evidence.findById(oid(req.params.id, "Evidence")).lean();
  if (!ev) throw new HttpError(404, "Evidence not found");
  const u = req.user!;
  let allowed = u.role === "ADMIN" || u.role === "INSPECTOR" || String(ev.uploadedBy) === u.id;
  if (!allowed && u.role === "STAFF" && ev.issue) {
    const issue = await Issue.findById(ev.issue).select("assignedTo").lean();
    allowed = !!issue && String(issue.assignedTo) === u.id;
  }
  if (!allowed) throw new HttpError(403, "Forbidden", "FORBIDDEN");
  const full = path.join(config.uploadDir, path.basename(ev.fileName));
  if (!fs.existsSync(full)) throw new HttpError(404, "File missing on disk");
  res.set({ "Content-Type": ev.mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
  res.sendFile(full);
});

// Uploader may remove a mistaken photo while it is still editable.
router.delete("/:id", auth("INSPECTOR", "STAFF"), async (req, res) => {
  const ev = await Evidence.findById(oid(req.params.id, "Evidence"));
  if (!ev || String(ev.uploadedBy) !== req.user!.id) throw new HttpError(404, "Evidence not found");
  if (ev.type === "BEFORE" && ev.inspection) throw new HttpError(409, "Evidence already attached to a submitted inspection", "LOCKED");
  if (ev.type === "AFTER") {
    const issue = await Issue.findById(ev.issue).select("status rejectionCount").lean();
    if (!issue || issue.status !== "IN_PROGRESS" || issue.rejectionCount !== ev.round) throw new HttpError(409, "Evidence is locked after submission", "LOCKED");
  }
  await ev.deleteOne();
  removeFile(ev.fileName);
  res.json({ ok: true });
});

export default router;
