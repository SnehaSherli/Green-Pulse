import mongoose from "mongoose";
import { config } from "./config";

/**
 * Safely sanitizes MongoDB URI to handle unencoded special characters in username or password (e.g. '@' in password).
 */
export function sanitizeMongoUri(uri: string): string {
  if (!uri) return uri;
  const match = uri.match(/^(mongodb(?:\+srv)?:\/\/)([^/?#]+)(.*)$/);
  if (!match) return uri;
  const [, prefix, authAndHost, rest] = match;
  const lastAt = authAndHost.lastIndexOf("@");
  if (lastAt === -1) return uri; // no auth section
  const auth = authAndHost.slice(0, lastAt);
  const host = authAndHost.slice(lastAt + 1);
  const colon = auth.indexOf(":");
  if (colon === -1) {
    const user = decodeURIComponent(auth);
    return `${prefix}${encodeURIComponent(user)}@${host}${rest}`;
  }
  const user = decodeURIComponent(auth.slice(0, colon));
  const pass = decodeURIComponent(auth.slice(colon + 1));
  return `${prefix}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}${rest}`;
}

/**
 * Mask credentials in URI for safe logging (never leak passwords in logs).
 */
export function maskMongoUri(uri: string): string {
  if (!uri) return "(empty)";
  return uri.replace(/\/\/[^@]*@/, "//***:***@");
}

export async function connectDb(uri = config.mongoUri, maxRetries = 3): Promise<void> {
  mongoose.set("strictQuery", true);

  if (config.isProd && !process.env.MONGODB_URI) {
    console.warn("[GreenPulse DB] WARNING: MONGODB_URI is not set in production environment. A remote MongoDB Atlas connection string is required on Render.");
  }

  const rawUri = uri || config.mongoUri;
  const sanitized = sanitizeMongoUri(rawUri);
  const masked = maskMongoUri(sanitized);

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      console.log(`[GreenPulse DB] Connecting to MongoDB (attempt ${attempt}/${maxRetries}): ${masked}`);
      await mongoose.connect(sanitized, {
        serverSelectionTimeoutMS: 15000,
      });
      console.log(`[GreenPulse DB] MongoDB connected successfully to ${masked}`);
      // make sure unique / lookup indexes exist (qrToken, email, ...)
      await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
      return;
    } catch (err: any) {
      console.error(`[GreenPulse DB] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxRetries) {
        console.log(`[GreenPulse DB] Retrying in 3 seconds...`);
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        if (err.message?.includes("ENOTFOUND") || err.message?.includes("querySrv")) {
          console.error("[GreenPulse DB] Diagnostic: DNS host lookup failed. Verify your Atlas cluster hostname or check for special characters in username/password.");
        } else if (err.message?.includes("Authentication failed") || err.message?.includes("auth error")) {
          console.error("[GreenPulse DB] Diagnostic: Authentication failed. Verify your database username and password in MONGODB_URI.");
        } else if (err.message?.includes("timed out") || err.message?.includes("whitelist") || err.message?.includes("connection attempt failed")) {
          console.error("[GreenPulse DB] Diagnostic: Connection timed out. Confirm 0.0.0.0/0 is Active in MongoDB Atlas Network Access.");
        }
        throw err;
      }
    }
  }
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

