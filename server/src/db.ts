import mongoose from "mongoose";
import { config } from "./config";

export async function connectDb(uri = config.mongoUri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  // make sure unique / lookup indexes exist (qrToken, email, ...)
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
