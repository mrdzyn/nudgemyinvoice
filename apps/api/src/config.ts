import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { assertSandboxConfig } from "@nmi/paypal";

const WILDCARD_HOSTS = new Set(["0.0.0.0", "::"]);

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
  // Interface to listen on. Loopback by default; a wildcard is accepted only with NODE_ENV=production
  // (a hosted container must listen on 0.0.0.0 so the platform router can reach it).
  HOST: z
    .string()
    .refine((h) => isIP(h) !== 0, "HOST must be an IP address")
    .default("127.0.0.1"),
  // "false" (default), "true" (trust every hop: development/test behind a known local proxy only) or
  // a hop count: trust exactly that many proxies counted from the server, so a client-supplied
  // X-Forwarded-For entry can never become the address that login throttling keys on.
  TRUST_PROXY: z.enum(["true", "false", "1", "2", "3"]).default("false"),
  // Directory with the built web app (apps/web/dist). Defaults to it in production; absent otherwise.
  WEB_DIST_DIR: z.string().min(1).optional(),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(4096).default(1024),
  // Real PayPal sandbox calls are OFF unless explicitly enabled, and then credentials are mandatory.
  PAYPAL_DRAFTS_ENABLED: z.enum(["true", "false"]).default("false"),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  /** Interface the server binds. 127.0.0.1 unless explicitly configured (wildcard needs production). */
  host: string;
  /** Built web app served from this same origin, or null (development: Vite serves it). */
  webDistDir: string | null;
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
  /** false, true (all hops) or the number of trusted proxy hops. */
  trustProxy: boolean | number;
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
  if (WILDCARD_HOSTS.has(e.HOST) && e.NODE_ENV !== "production") {
    throw new Error("HOST=0.0.0.0 or :: is only accepted with NODE_ENV=production");
  }
  if (e.NODE_ENV === "production") {
    // Hosted mode fails closed on anything that would weaken the browser boundary.
    if (!webOrigin.startsWith("https://")) {
      throw new Error("NODE_ENV=production requires an https WEB_ORIGIN");
    }
    if (e.TRUST_PROXY === "true") {
      throw new Error("NODE_ENV=production requires TRUST_PROXY=false or a hop count (1-3)");
    }
  }
  const trustProxy =
    e.TRUST_PROXY === "true" ? true : e.TRUST_PROXY === "false" ? false : Number(e.TRUST_PROXY);
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    webDistDir:
      e.WEB_DIST_DIR ??
      (e.NODE_ENV === "production"
        ? fileURLToPath(new URL("../../web/dist", import.meta.url))
        : null),
    webOrigin,
    paypalBaseUrl: paypal.origin,
    aiConfigured: Boolean(e.OPENAI_API_KEY && e.OPENAI_MODEL),
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET,
    sessionTtlMinutes: e.SESSION_TTL_MINUTES,
    sessionIdleMinutes: e.SESSION_IDLE_MINUTES,
    cookieSecure: e.NODE_ENV === "production" || webOrigin.startsWith("https://"),
    trustProxy,
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
