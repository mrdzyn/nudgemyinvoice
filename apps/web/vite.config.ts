import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Only VITE_-prefixed variables reach the bundle. Never put secrets behind that prefix.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/health": "http://127.0.0.1:3001" } },
});
