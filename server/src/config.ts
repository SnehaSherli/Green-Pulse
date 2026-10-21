import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const isProd = process.env.NODE_ENV === "production";

if (isProd && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/greenpulse",
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  publicAppUrl: (process.env.PUBLIC_APP_URL || "").replace(/\/+$/, ""),
  clientOrigin: process.env.CLIENT_ORIGIN || "",
  seedOnStart: process.env.SEED_ON_START !== "false",
  uploadDir: process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve(__dirname, "../uploads"),
  maxUploadBytes: 6 * 1024 * 1024,
};

export const DEMO_PASSWORD = "GreenPulse@123";
