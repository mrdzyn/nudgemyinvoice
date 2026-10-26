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
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(4096).default(1024),
  // Real PayPal sandbox calls are OFF unless explicitly enabled, and then credentials are mandatory.
  PAYPAL_DRAFTS_ENABLED: z.enum(["true", "false"]).default("false"),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
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
  /** Server-only. Null unless both OPENAI_API_KEY and OPENAI_MODEL are set; never logged or returned. */
  openai: { apiKey: string; model: string; maxOutputTokens: number } | null;
  /** True only when the owner explicitly enabled real PayPal sandbox draft creation. */
  paypalDraftsEnabled: boolean;
  /** Server-only. Present only when drafts are enabled. */
  paypalCredentials: { clientId: string; clientSecret: string } | null;
}

/** Fails fast: missing/live PayPal config, missing database or weak session secret refuse to start. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env);
  const paypal = assertSandboxConfig(e);
  const webOrigin = new URL(e.WEB_ORIGIN).origin;
  const draftsEnabled = e.PAYPAL_DRAFTS_ENABLED === "true";
  if (draftsEnabled && (!e.PAYPAL_CLIENT_ID || !e.PAYPAL_CLIENT_SECRET)) {
    // Fail closed: never start in a mode that pretends PayPal drafting works without credentials.
    throw new Error(
      "PAYPAL_DRAFTS_ENABLED=true requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET",
    );
  }
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
    openai:
      e.OPENAI_API_KEY && e.OPENAI_MODEL
        ? {
            apiKey: e.OPENAI_API_KEY,
            model: e.OPENAI_MODEL,
            maxOutputTokens: e.OPENAI_MAX_OUTPUT_TOKENS,
          }
        : null,
    paypalDraftsEnabled: draftsEnabled,
    paypalCredentials:
      draftsEnabled && e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET
        ? { clientId: e.PAYPAL_CLIENT_ID, clientSecret: e.PAYPAL_CLIENT_SECRET }
        : null,
  };
}
