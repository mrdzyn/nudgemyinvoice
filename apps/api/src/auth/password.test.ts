import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, dummyHash } from "./password.js";

const weak = { N: 1024, r: 8, p: 1 };

describe("password hashing (scrypt)", () => {
  it("never stores the plaintext and uses an independent salt each time", async () => {
    const [a, b] = await Promise.all([
      hashPassword("correct horse battery", weak),
      hashPassword("correct horse battery", weak),
    ]);
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$1024$8$1$")).toBe(true);
    expect(a).not.toContain("correct horse battery");
  });
  it("verifies the right password and rejects wrong ones", async () => {
    const h = await hashPassword("correct horse battery", weak);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
  });
  it.each([
    "",
    "plaintext",
    "bcrypt$1$2$3$4$5",
    "scrypt$1000$8$1$c2FsdHNhbHQ$AAAA", // N not a power of two
    "scrypt$1024$8$1$c2FsdHNhbHQ$AAAA", // wrong key length
    "scrypt$4294967296$8$1$c2FsdHNhbHQ$AAAA", // absurd cost (DoS guard)
    "scrypt$1024$8$99$c2FsdHNhbHQ$AAAA",
    "scrypt$1024$8$1$$",
  ])("fails closed on malformed stored value %j", async (stored) => {
    expect(await verifyPassword("anything", stored)).toBe(false);
  });
  it("provides a dummy hash with the requested cost for unknown usernames", async () => {
    const d = await dummyHash(weak);
    expect(d.startsWith("scrypt$1024$8$1$")).toBe(true);
    expect(await verifyPassword("whatever", d)).toBe(false);
  });
});
