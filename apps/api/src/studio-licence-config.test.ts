import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { baseEnv } from "./test-support.js";

/** P5: AG_STUDIO_LICENSE_KEY is optional, server-only, and a malformed value fails closed without echoing it. */
describe("AG_STUDIO_LICENSE_KEY configuration", () => {
  it("is absent by default and blank counts as absent", () => {
    expect(loadConfig(baseEnv).studioLicenceKey).toBeNull();
    expect(loadConfig({ ...baseEnv, AG_STUDIO_LICENSE_KEY: "   " }).studioLicenceKey).toBeNull();
  });

  it("accepts the printable-ASCII shape real licences have, including inner spaces", () => {
    const key = `Synthetic [Studio] licence ${randomBytes(12).toString("hex")} _v3_`;
    expect(loadConfig({ ...baseEnv, AG_STUDIO_LICENSE_KEY: key }).studioLicenceKey).toBe(key);
  });

  it("keeps a well-formed value (trimmed) for the authenticated route only", () => {
    const key = `synthetic-${randomBytes(20).toString("hex")}`;
    expect(loadConfig({ ...baseEnv, AG_STUDIO_LICENSE_KEY: ` ${key}\n` }).studioLicenceKey).toBe(
      key,
    );
  });

  it.each([
    ["too short", "short-key"],
    ["tab", `synthetic\tlicence-${randomBytes(10).toString("hex")}`],
    ["newline", `synthetic\nlicence-${randomBytes(10).toString("hex")}`],
    ["control character", `synthetic\u0007${randomBytes(10).toString("hex")}`],
  ])("refuses to start with a malformed value (%s) and never echoes it", (_name, bad) => {
    let message = "";
    try {
      loadConfig({ ...baseEnv, AG_STUDIO_LICENSE_KEY: bad });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("AG_STUDIO_LICENSE_KEY");
    expect(message).not.toContain(bad.trim());
  });
});
