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

const router = Router();
router.get("/healthz", (_req, res) => res.json({ status: "ok" }));
// Public, non-sensitive: lets the UI know which base URL the QR codes should use
router.get("/config", (_req, res) => res.json({ publicAppUrl: config.publicAppUrl || null }));
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
