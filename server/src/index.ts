import os from "os";
import mongoose from "mongoose";
import { createApp } from "./app";
import { config } from "./config";
import { connectDb } from "./db";
import { ensureDemoHistory, ensureSeedData } from "./services/seed";
import { escalateOverdue } from "./services/issues";

async function main() {
  const app = createApp();

  // 1. Bind the HTTP server immediately on 0.0.0.0:PORT so Render port scan succeeds
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`GreenPulse server listening on http://0.0.0.0:${config.port}`);
    const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i!.address);
    if (lan.length) console.log(`LAN address(es) for the phone demo: ${lan.join(", ")}`);
  });

  server.on("error", (err: any) => {
    console.error(`[GreenPulse Server] Port binding error: ${err.message}`);
    process.exit(1);
  });

  // 2. Connect to MongoDB Atlas (with retry & URI sanitization)
  try {
    await connectDb();
    if (config.seedOnStart) {
      console.log("[GreenPulse DB] Checking and ensuring demo seed data...");
      await ensureSeedData();
      await ensureDemoHistory();
      console.log("[GreenPulse DB] Demo seed data is ready.");
    }

    // Periodic escalation check for overdue issues
    setInterval(() => {
      if (mongoose.connection.readyState === 1) {
        escalateOverdue().catch((e) => console.error("[GreenPulse] Escalation check failed:", e.message));
      }
    }, 5 * 60 * 1000);
  } catch (err: any) {
    console.error("[GreenPulse DB] Startup database connection failed:", err.message);
    console.error("[GreenPulse DB] The server remains listening on the port. Healthcheck /api/healthz will report 503 until MongoDB connectivity is established.");
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[GreenPulse] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log("[GreenPulse] HTTP server closed.");
      mongoose.disconnect().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  console.error("Fatal startup error:", e.message);
  process.exit(1);
});

