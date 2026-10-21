import { defineConfig, mergeConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import base from "./vite.config";

// HTTPS dev server (self-signed certificate). Phones only allow camera access on HTTPS
// (or localhost), so use this one for the live phone-camera QR demo.
export default mergeConfig(base, defineConfig({ plugins: [basicSsl()], server: { https: {} as any } }));
