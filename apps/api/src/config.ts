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
  // Authentication and approvals require PostgreSQL. The pending owner decision on SQLite parity is
  // NOT resolved here: a non-PostgreSQL URL is simply rejected.
  DATABASE_URL: z
    .string()
    .regex(
      /^postgres(ql)?:\/\//,
      "DATABASE_URL must be a postgres:// URL (SQLite is not supported)",
    ),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(480),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  /** Normalized origin (scheme + host + port) of the only browser origin allowed to call the API. */
  webOrigin: string;
  paypalBaseUrl: string;
  /** True only when both key and model are set; secrets themselves are never exposed from config helpers. */
  aiConfigured: boolean;
  databaseUrl: string;
  /** Server-only. Used to derive CSRF tokens; never logged or returned. */
  sessionSecret: string;
  sessionTtlMinutes: number;
  sessionIdleMinutes: number;
  /** Cookies are Secure in production or whenever the web origin is https. */
  cookieSecure: boolean;
  trustProxy: boolean;
}

/** Fails fast: missing/live PayPal config, missing database or weak session secret refuse to start. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env);
  const paypal = assertSandboxConfig(e);
  const webOrigin = new URL(e.WEB_ORIGIN).origin;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    webOrigin,
    paypalBaseUrl: paypal.origin,
    aiConfigured: Boolean(e.OPENAI_API_KEY && e.OPENAI_MODEL),
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET,
    sessionTtlMinutes: e.SESSION_TTL_MINUTES,
    sessionIdleMinutes: e.SESSION_IDLE_MINUTES,
    cookieSecure: e.NODE_ENV === "production" || webOrigin.startsWith("https://"),
    trustProxy: e.TRUST_PROXY === "true",
  };
}
