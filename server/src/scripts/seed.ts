import { connectDb, disconnectDb } from "../db";
import { ensureDemoHistory, ensureSeedData } from "../services/seed";

(async () => {
  await connectDb();
  console.log("Seeding (idempotent)…");
  await ensureSeedData();
  await ensureDemoHistory();
  console.log("Done.");
  await disconnectDb();
})().catch((e) => { console.error(e); process.exit(1); });
