import { Router } from "express";
import { config } from "../config";
import auth from "./auth";
import users from "./users";
import locations from "./locations";
import standards from "./standards";
import inspections from "./inspections";
import evidence from "./evidence";
import issues from "./issues";
import notifications from "./notifications";
import dashboard from "./dashboard";

import mongoose from "mongoose";

const router = Router();
router.get("/healthz", (_req, res) => {
  const ready = mongoose.connection.readyState;
  if (ready === 1) {
    return res.status(200).json({ status: "ok", database: "connected" });
  }
  return res.status(503).json({
    status: "unavailable",
    database: ready === 2 ? "connecting" : "disconnected",
    message: "Database is not connected",
  });
});

// Public, non-sensitive: lets the UI know which base URL the QR codes should use
router.get("/config", (_req, res) => res.json({ publicAppUrl: config.publicAppUrl || null }));

// Guard stateful API endpoints if database is not connected
router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "Database service unavailable. Please check MongoDB Atlas connection and configuration.",
      code: "DB_UNAVAILABLE",
    });
  }
  next();
});
router.use("/auth", auth);
router.use("/users", users);
router.use("/locations", locations);
router.use("/standards", standards);
router.use("/inspections", inspections);
router.use("/evidence", evidence);
router.use("/issues", issues);
router.use("/notifications", notifications);
router.use(dashboard);
export default router;
