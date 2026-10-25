import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** 256-bit opaque token. Only its SHA-256 is persisted. */
export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Synchronizer-style CSRF token bound to one session: HMAC(server secret, session token hash).
 * Deterministic, so a page reload can fetch it again via the authenticated session endpoint, and
 * unforgeable without SESSION_SECRET. A different session or secret yields a different value.
 */
export function csrfTokenFor(secret: string, tokenHash: string): string {
  return createHmac("sha256", secret).update(`nmi-csrf-v1:${tokenHash}`).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
