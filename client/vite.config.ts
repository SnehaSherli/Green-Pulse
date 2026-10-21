import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The browser talks only to Vite (same origin); /api is proxied to the Express server.
// Same origin => the httpOnly login cookie just works, on laptop and phone alike.
export const proxy = { "/api": { target: "http://localhost:5000", changeOrigin: false, xfwd: true } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173, proxy },
  preview: { host: true, port: 4173, proxy },
});
