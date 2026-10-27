/**
 * Browser-generated Idempotency-Key for `POST /api/invoice-drafts`. 128 bits from the platform CSPRNG,
 * base64url, so it matches the server contract `^[A-Za-z0-9_-]{8,128}$`. Keys are held only in volatile
 * React memory (see the Review form) and are never stored, logged or shown.
 */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
