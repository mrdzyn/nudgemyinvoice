import { randomBytes } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { STUDIO_STYLE_HASHES } from "./studio-style-hashes.js";

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

/**
 * P5: AG Studio/Charts/Grid theming injects <style> ELEMENTS at runtime. Rather than `'unsafe-inline'`, every
 * shell response gets a fresh random nonce that authorises only <style> elements carrying it (the libraries'
 * `styleNonce` option), plus the exact hashes of the few vendor stylesheets AG Studio 3.0.0 injects without
 * that nonce (studio-style-hashes.ts, SEC-N1). Scripts stay `'self'` only; style ATTRIBUTES stay blocked. The
 * nonce is published to the page in `<meta name="nmi-style-nonce">` so the Studio widgets can pass it on.
 */
export const STYLE_NONCE_META = "nmi-style-nonce";
const styleSources = (nonce: string, q: string) =>
  [
    `${q}self${q}`,
    `${q}nonce-${nonce}${q}`,
    ...STUDIO_STYLE_HASHES.map((h) => `${q}${h}${q}`),
  ].join(" ");
export const pageCsp = (nonce: string): string =>
  PAGE_CSP.replace("style-src 'self'", `style-src ${styleSources(nonce, "'")}`);
/** The build-time <meta> CSP's style directive, as written raw or HTML-escaped (Vite emits `&#39;`). */
const META_STYLE_SRC = [
  ["style-src 'self';", (n: string) => `style-src ${styleSources(n, "'")};`],
  ["style-src &#39;self&#39;;", (n: string) => `style-src ${styleSources(n, "&#39;")};`],
] as const;
/** For API/health/error responses: nothing may be loaded or framed from them. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

export function registerWebStatic(app: FastifyInstance, distDir: string): void {
  const files = indexTree(distDir);
  const shell = files.get("/index.html");
  if (!shell) throw new Error(`WEB_DIST_DIR has no index.html (run the web build): ${distDir}`);

  const shellText = shell.body.toString("utf8");
  // A build-time <meta> CSP intersects with the header: if the shell has one whose style directive this server
  // cannot extend with the nonce, Studio styles would be silently blocked. Refuse to start instead.
  const metaForm = META_STYLE_SRC.find(([raw]) => shellText.includes(raw));
  if (/http-equiv="Content-Security-Policy"/i.test(shellText) && !metaForm) {
    throw new Error(
      "index.html has a CSP <meta> whose style-src cannot carry the per-response nonce",
    );
  }
  /**
   * The shell with a fresh nonce: in the header CSP, in the build-time <meta> CSP (two policies intersect, so
   * both must allow it) and in the nonce <meta>. `no-store`: a document carrying a one-time nonce is never kept.
   */
  const sendShell = (reply: FastifyReply) => {
    const nonce = randomBytes(16).toString("base64");
    let html = metaForm ? shellText.replace(metaForm[0], metaForm[1](nonce)) : shellText;
    if (html.includes("</head>"))
      html = html.replace("</head>", `<meta name="${STYLE_NONCE_META}" content="${nonce}"></head>`);
    void reply.header("content-type", shell.type);
    void reply.header("cache-control", "no-store");
    void reply.header("content-security-policy", pageCsp(nonce));
    return reply.send(html);
  };

  const send = (reply: FastifyReply, entry: Entry, urlPath: string, isShell: boolean) => {
    if (isShell) return sendShell(reply);
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
