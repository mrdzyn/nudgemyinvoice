import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const LICENCE_ENDPOINT = "/__nmi_dev/studio-licence";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads ONLY the AG_STUDIO_LICENSE_KEY line from an untracked `.env.local` (repo root or apps/web).
 * Deliberately not `loadEnv`/`dotenv` for the whole file: that file also holds server-side provider
 * secrets, which must never be parsed into anything the web tooling can see. The value is returned
 * to the caller only; it is never logged, put in a URL or defined into module code.
 */
export function readStudioLicenceKey(dirs: readonly string[]): string | null {
  for (const dir of dirs) {
    const file = join(dir, ".env.local");
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?AG_STUDIO_LICENSE_KEY\s*=\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      let value = m[1] ?? "";
      if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * Strictly development-only licence bridge for the local AG Studio evaluation (A5-I1).
 *
 * - `apply: "serve"` + `configureServer`: exists only on the Vite DEV server. It is not registered for
 *   `vite build` (any --mode) or `vite preview`, so no build artifact can ever contain the key.
 * - Active only when VITE_NMI_STUDIO_LOCAL=1 and the dev server listens on loopback.
 * - The key is served by a runtime request, never injected with `define`/virtual modules, so it is not
 *   in any transformed module. The request must come from a loopback socket, a loopback Host header
 *   (DNS-rebinding guard), carry a custom header (cross-origin pages cannot send it without a CORS
 *   preflight, which is never granted) and not be a cross-site fetch. Responses are `no-store`.
 * - The key is client-visible to the local browser once Studio is activated; that is inherent to
 *   `AgStudioProvider licenseKey`, and is why this is never wired into hosted or CI builds.
 */
export function studioDevLicence(flagOn: boolean, dirs?: readonly string[]): Plugin {
  return {
    name: "nmi-studio-dev-licence",
    apply: "serve",
    configureServer(server) {
      if (!flagOn) return;
      const host = server.config.server.host;
      if (
        host !== undefined &&
        host !== false &&
        !["localhost", "127.0.0.1", "::1"].includes(String(host))
      ) {
        server.config.logger.warn(
          "nmi-studio-dev-licence: disabled (dev server is not bound to loopback)",
        );
        return;
      }
      const key = readStudioLicenceKey(dirs ?? [here, resolve(here, "../..")]);
      server.middlewares.use(LICENCE_ENDPOINT, (req, res) => {
        const remote = req.socket.remoteAddress ?? "";
        const hostName = (req.headers.host ?? "").replace(/:\d+$/, "");
        const site = req.headers["sec-fetch-site"];
        const ok =
          req.method === "GET" &&
          ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote) &&
          LOOPBACK_HOSTS.has(hostName) &&
          req.headers["x-nmi-dev-studio"] === "1" &&
          (site === undefined || site === "same-origin");
        res.setHeader("Cache-Control", "no-store");
        if (!ok) {
          res.statusCode = 403;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ licenseKey: key }));
      });
    },
  };
}

const LICENSED = /^ag-(studio|studio-react|charts-enterprise|grid-enterprise)(\/|$)/;
const LICENSED_PATH =
  /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?ag-(?:studio|studio-react|charts-enterprise|grid-enterprise)\//;

/**
 * Defence in depth for ordinary builds: the licensed AG Studio packages (and the enterprise grid/charts they
 * pull in) exist only behind the dev-gated Studio slot, which is removed from production builds at build time.
 * If anything ever resolves or bundles one of them in `vite build` (any mode, any env), the build FAILS rather
 * than silently shipping licensed code.
 */
export function studioBuildGuard(): Plugin {
  return {
    name: "nmi-studio-build-guard",
    apply: "build",
    resolveId(source) {
      if (LICENSED.test(source))
        this.error(
          `A licensed AG Studio package ("${source}") must never be part of a production build.`,
        );
      return null;
    },
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        const hit = chunk.moduleIds.find((id) => LICENSED_PATH.test(id));
        if (hit) this.error("A licensed AG Studio module reached the production bundle.");
      }
    },
  };
}
