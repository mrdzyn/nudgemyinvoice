import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";

export function healthRoutes(app: FastifyInstance, config: AppConfig): void {
  app.get("/health", async () => ({
    status: "ok",
    paypalEnvironment: "sandbox",
    aiConfigured: config.aiConfigured,
  }));
}
