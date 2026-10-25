import { describe, expect, it } from "vitest";
import {
  csrfTokenFor,
  hashToken,
  isWellFormedToken,
  newSessionToken,
  safeEqual,
} from "./session-token.js";

describe("session tokens", () => {
  it("are 256-bit random, well formed, and hash to a different stored value", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { token, tokenHash } = newSessionToken();
      expect(isWellFormedToken(token)).toBe(true);
      expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(tokenHash).not.toContain(token);
      expect(hashToken(token)).toBe(tokenHash);
      seen.add(token);
    }
    expect(seen.size).toBe(200);
  });
  it.each([
    undefined,
    null,
    5,
    "",
    "short",
    "a".repeat(42),
    "a".repeat(44),
    `${"a".repeat(42)}!`,
    "' OR 1=1 --",
  ])("rejects malformed token %j", (v) => expect(isWellFormedToken(v)).toBe(false));
  it("CSRF tokens are bound to both the session and the server secret", () => {
    const s = "s".repeat(40);
    const a = csrfTokenFor(s, hashToken("a".repeat(43)));
    expect(csrfTokenFor(s, hashToken("a".repeat(43)))).toBe(a);
    expect(csrfTokenFor(s, hashToken("b".repeat(43)))).not.toBe(a);
    expect(csrfTokenFor("t".repeat(40), hashToken("a".repeat(43)))).not.toBe(a);
  });
  it("safeEqual compares by value and length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
