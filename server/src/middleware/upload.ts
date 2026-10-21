import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "../config";
import { badRequest } from "../http";

fs.mkdirSync(config.uploadDir, { recursive: true });

const EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadDir),
    // random server-side name: the client-supplied filename is never used on disk
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + (EXT[file.mimetype] || ".bin")),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXT[file.mimetype]) return cb(badRequest("Only JPEG, PNG or WebP images are allowed", "BAD_FILE_TYPE"));
    cb(null, true);
  },
});

/** Check the magic bytes so a renamed non-image can't be stored. */
export function looksLikeImage(filePath: string) {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  return jpeg || png || webp;
}

export function removeFile(name: string) {
  fs.promises.unlink(path.join(config.uploadDir, path.basename(name))).catch(() => undefined);
}
