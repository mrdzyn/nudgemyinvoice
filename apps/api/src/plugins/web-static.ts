import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";

/**
 * Serves the built web app (apps/web/dist) from the API's own origin, so the browser, the session
 * cookie, the Origin check and the CSRF token all share one HTTPS origin and no runtime Vite server
 * exists in production.
 *
 * Safety by construction: the files are indexed ONCE at startup into a map keyed by their URL path;
 * a request can only select an existing key, so there is no filesystem path built from request input
 * (no traversal, no symlink or dotfile surprise). Nothing under /api or /health is ever answered
 * with HTML, and an unknown path that looks like a file is a 404, not the SPA shell.
 */
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

interface Entry {
  body: Buffer;
  type: string;
}

function indexTree(root: string): Map<string, Entry> {
  const files = new Map<string, Entry>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue; // never serve dotfiles
      const abs = join(dir, name);
      const st = lstatSync(abs); // lstat: a symlink is neither followed nor served
      if (st.isDirectory()) walk(abs);
      else if (st.isFile()) {
        const type = TYPES[extname(name).toLowerCase()];
        if (!type) continue; // unknown types are not served
        files.set("/" + relative(root, abs).split(sep).join("/"), {
          body: readFileSync(abs),
          type,
        });
      }
    }
  };
  walk(root);
  return files;
}

/** Same policy as the build-time <meta> tag, plus the directives a <meta> CSP cannot carry. */
export const PAGE_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
/** For API/health/error responses: nothing may be loaded or framed from them. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

export function registerWebStatic(app: FastifyInstance, distDir: string): void {
  const files = indexTree(distDir);
  const shell = files.get("/index.html");
  if (!shell) throw new Error(`WEB_DIST_DIR has no index.html (run the web build): ${distDir}`);

  const send = (reply: FastifyReply, entry: Entry, urlPath: string, isShell: boolean) => {
    void reply.header("content-type", entry.type);
    // Hashed build assets are immutable; the HTML shell must always revalidate (a new deploy
    // changes the asset names it references).
    void reply.header(
      "cache-control",
      isShell || !urlPath.startsWith("/assets/")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    );
    return reply.send(entry.body);
  };

  const isApiPath = (p: string) =>
    p === "/api" || p.startsWith("/api/") || p === "/health" || p.startsWith("/health/");

  app.setNotFoundHandler((req, reply) => {
    const raw = req.url.split("?")[0] ?? "";
    let path: string;
    try {
      path = decodeURIComponent(raw);
    } catch {
      return reply.code(400).header("cache-control", "no-store").send({ error: "bad_request" });
    }
    const apiish = isApiPath(path) || isApiPath(raw);
    const readOnly = req.method === "GET" || req.method === "HEAD";
    if (!readOnly || apiish) {
      return reply.code(404).header("cache-control", "no-store").send({ error: "not_found" });
    }
    const hit = files.get(path);
    if (hit && path !== "/index.html") return send(reply, hit, path, false);
    // A path whose last segment has an extension is a missing asset, never the SPA shell.
    const last = path.split("/").pop() ?? "";
    if (
      path !== "/index.html" &&
      (last.includes(".") || path.includes("\\") || path.includes("\0"))
    ) {
      return reply.code(404).header("cache-control", "no-store").send({ error: "not_found" });
    }
    return send(reply, shell, "/index.html", true);
  });
}
