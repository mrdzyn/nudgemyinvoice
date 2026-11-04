import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";

export const STUDIO_LICENCE_PATH = "/api/studio/licence";
/** Custom request header: not in the CORS allow-list, so no other origin can send it (preflight fails). */
export const STUDIO_LICENCE_HEADER = "x-nmi-studio";

/**
 * P5 licensed production dashboard: hands the owner's AG Studio deployment licence to the signed-in operator's
 * browser at runtime, because `AgStudioProvider licenseKey` is a browser-side licence model. It is therefore
 * visible to an authenticated operator by design; it is never placed in the static build, a URL, a log line or an
 * unauthenticated response, and every answer is `no-store` so neither the browser nor a proxy keeps a copy.
 */
export function studioLicenceRoutes(app: FastifyInstance, config: AppConfig): void {
  app.get(STUDIO_LICENCE_PATH, { preHandler: app.requireOperator }, async (req, reply) => {
    void reply
      .header("cache-control", "no-store, private")
      .header("pragma", "no-cache")
      .header("vary", "cookie");
    if (req.headers[STUDIO_LICENCE_HEADER] !== "1") {
      return reply.code(400).send({ error: "bad_request" });
    }
    if (!config.studioLicenceKey) {
      return reply.code(404).send({ error: "studio_licence_not_configured" });
    }
    return reply.send({ licenseKey: config.studioLicenceKey });
  });
}
