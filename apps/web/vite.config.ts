import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Production CSP for the UI shell: same-origin scripts and styles only, no inline styles, no
 * network connections of any kind (connect-src 'none'), no forms posting anywhere. It is applied
 * to the built page only, so the dev server's hot reload keeps working.
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
          "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'",
      },
      injectTo: "head-prepend",
    },
  ],
};

// Only VITE_-prefixed variables reach the bundle. Never put secrets behind that prefix.
export default defineConfig({
  plugins: [react(), shellCsp],
  server: { port: 5173, proxy: { "/health": "http://127.0.0.1:3001" } },
});
