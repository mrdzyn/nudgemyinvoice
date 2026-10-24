import { z } from "zod";
import { assertSandboxConfig } from "@nmi/paypal";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  PAYPAL_ENV: z.string().optional(),
  PAYPAL_API_BASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  webOrigin: string;
  paypalBaseUrl: string;
  /** True only when both key and model are set; secrets themselves are never exposed from config helpers. */
  aiConfigured: boolean;
}

/** Fails fast: a missing/live PayPal configuration refuses to start the server. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env);
  const paypal = assertSandboxConfig(e);
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    webOrigin: e.WEB_ORIGIN,
    paypalBaseUrl: paypal.origin,
    aiConfigured: Boolean(e.OPENAI_API_KEY && e.OPENAI_MODEL),
  };
}
