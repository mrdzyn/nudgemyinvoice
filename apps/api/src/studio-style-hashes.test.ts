import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pageCsp } from "./plugins/web-static.js";
import { STUDIO_STYLE_HASH_VERSIONS, STUDIO_STYLE_HASHES } from "./plugins/studio-style-hashes.js";

/** SEC-N1: the vendor-stylesheet hash allowlist is exact, provenance-checked and tied to the pinned versions. */
const sha = (s: string) => `sha256-${createHash("sha256").update(s, "utf8").digest("base64")}`;
const lock = readFileSync(
  fileURLToPath(new URL("../../../pnpm-lock.yaml", import.meta.url)),
  "utf8",
);

describe("AG Studio vendor style hashes (replacing the removed createElement shim)", () => {
  it("is exactly four distinct sha256 sources", () => {
    expect(STUDIO_STYLE_HASHES).toHaveLength(4);
    expect(new Set(STUDIO_STYLE_HASHES).size).toBe(4);
    for (const h of STUDIO_STYLE_HASHES) expect(h).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/);
  });

  it("two entries are independently derivable: the empty pre-fill sheet and AG Studio's colour sensor", () => {
    expect(STUDIO_STYLE_HASHES).toContain(sha(""));
    expect(STUDIO_STYLE_HASHES).toContain(
      sha(
        "@property --ag-studio-color-change { syntax: '<color>'; inherits: true; initial-value: transparent; }",
      ),
    );
  });

  it("the lockfile still resolves exactly the vendor versions the hashes were captured from", () => {
    for (const [pkg, version] of Object.entries(STUDIO_STYLE_HASH_VERSIONS)) {
      const resolved = new Set(
        [...lock.matchAll(new RegExp(`^ {2}${pkg}@(\\d+\\.\\d+\\.\\d+)`, "gm"))].map((m) => m[1]),
      );
      expect([...resolved], `${pkg}: recapture the hashes on upgrade`).toEqual([version]);
    }
  });

  it("the page policy adds only the nonce and these hashes to style-src: no unsafe-*, nothing for scripts", () => {
    const csp = pageCsp("AAAAAAAAAAAAAAAAAAAAAA==");
    const style = /style-src ([^;]+);/.exec(csp)?.[1]?.split(" ") ?? [];
    expect(style).toEqual([
      "'self'",
      "'nonce-AAAAAAAAAAAAAAAAAAAAAA=='",
      ...STUDIO_STYLE_HASHES.map((h) => `'${h}'`),
    ]);
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/unsafe|style-src-attr|https?:|\*/);
  });
});
