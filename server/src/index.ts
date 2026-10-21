import os from "os";
import { createApp } from "./app";
import { config } from "./config";
import { connectDb } from "./db";
import { ensureDemoHistory, ensureSeedData } from "./services/seed";
import { escalateOverdue } from "./services/issues";

async function main() {
  await connectDb();
  console.log(`MongoDB connected: ${config.mongoUri.replace(/\/\/[^@]*@/, "//***@")}`);
  if (config.seedOnStart) {
    await ensureSeedData();
    await ensureDemoHistory();
  }
  createApp().listen(config.port, "0.0.0.0", () => {
    console.log(`GreenPulse API listening on http://localhost:${config.port}`);
    const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i!.address);
    if (lan.length) console.log(`LAN address(es) for the phone demo: ${lan.join(", ")}`);
  });
  setInterval(() => escalateOverdue().catch((e) => console.error("escalation failed", e)), 5 * 60 * 1000);
}
main().catch((e) => { console.error("Failed to start:", e.message); process.exit(1); });
