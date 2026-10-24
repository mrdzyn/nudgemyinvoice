import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { healthRoutes } from "./routes/health.js";

export function buildApp(config: AppConfig): FastifyInstance {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    logger: {
      level: config.nodeEnv === "test" ? "silent" : "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['paypal-auth-algo']",
      ],
    },
  });
  healthRoutes(app, config);
  return app;
}
