import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import { config } from "./config";
import routes from "./routes";
import { apiNotFound, errorHandler } from "./middleware/errors";

export function createApp() {
  const app = express();
  app.set("trust proxy", true); // so req.protocol/host reflect the browser-facing address behind the Vite proxy
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "same-origin" });
    next();
  });
  if (config.clientOrigin) app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());

  app.use("/api", routes);
  app.use("/api", apiNotFound);

  // Production: serve the built React app and fall back to index.html so that
  // direct navigation / refresh on any client route (e.g. /inspect/<token>) never 404s.
  const dist = path.resolve(__dirname, "../../client/dist");
  if (fs.existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
