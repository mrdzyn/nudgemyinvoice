import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Production CSP: same-origin scripts and styles only, no inline styles, network connections ONLY
 * to this same origin (connect-src 'self', which is where the reverse proxy forwards /api), no
 * forms posting anywhere, no third-party endpoints. It is applied to the built page only, so the
 * dev server's hot reload keeps working.
 */
const shellCsp: Plugin = {
  name: "nmi-shell-csp",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content:
          "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'",
      },
      injectTo: "head-prepend",
    },
  ],
};

// NMI_API_ORIGIN (no VITE_ prefix, so it never reaches the bundle) only moves the local proxy
// target, e.g. when port 3001 is taken. It is a developer-machine setting, not a browser one.
const apiOrigin = process.env["NMI_API_ORIGIN"] ?? "http://127.0.0.1:3001";
const apiProxy = { "/api": apiOrigin, "/health": apiOrigin };

// Only VITE_-prefixed variables reach the bundle. Never put secrets behind that prefix.
export default defineConfig({
  plugins: [react(), shellCsp],
  // The browser only ever talks to its own origin; /api is forwarded to the Fastify server. The
  // proxy keeps the browser's Origin header, which the API compares with WEB_ORIGIN (for the dev
  // server that must be exactly http://localhost:5173; for `vite preview`, http://localhost:4173).
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 4173, proxy: apiProxy },
});
