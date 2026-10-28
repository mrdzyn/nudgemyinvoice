import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Objective (NMI-DEMO-R0): the SIMULATED evaluation launcher and the fake providers stay test-only.
 * No production source may import, reference or switch to them, and the launcher itself must refuse
 * to start without an explicit opt-in, in production mode, or against a non-Sandbox PayPal host.
 */
const repo = join(import.meta.dirname, "..", "..", "..");
const SOURCE_DIRS = ["apps/api/src", "apps/web/src", "packages"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    if (f === "node_modules" || f === "dist") return [];
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}
const prod = SOURCE_DIRS.flatMap((d) => sources(join(repo, d))).filter(
  (f) => !/test-paypal\.ts$|test-support\.ts$|testing[\\/]/.test(f),
);

describe("fake providers are not reachable from production code", () => {
  it("finds the production sources it audits", () => {
    expect(prod.length).toBeGreaterThan(40);
  });
  it.each([
    ["the simulated evaluation launcher", /simulated-eval-server|NMI_SIMULATED_EVAL/],
    ["the fake PayPal helper", /test-paypal|fakePayPal/],
    ["a fake-model/fake-PayPal environment switch", /NMI_FAKE_MODEL|NMI_FAKE_PAYPAL|FAKE_PROVIDER/],
  ])("no production file references %s", (_n, pattern) => {
    const hits = prod
      .filter((f) => pattern.test(readFileSync(f, "utf8")))
      .map((f) => relative(repo, f));
    expect(hits).toEqual([]);
  });
  it("the production entrypoint wires only the real OpenAI and PayPal clients", () => {
    const server = readFileSync(join(repo, "apps/api/src/server.ts"), "utf8");
    expect(server).toContain("createOpenAIInvoiceClient");
    expect(server).toContain("PayPalSandboxClient");
    expect(server).not.toMatch(/fake|simulated|NMI_/i);
  });
});

describe("the simulated evaluation launcher fails closed", () => {
  const launcher = readFileSync(
    join(repo, "design/evidence/NMI-DEMO-R0/simulated-eval-server.ts"),
    "utf8",
  );
  it("requires an explicit opt-in, refuses production and refuses a non-Sandbox PayPal host", () => {
    expect(launcher).toMatch(/NMI_SIMULATED_EVAL !== "1"[\s\S]*process\.exit\(2\)/);
    expect(launcher).toMatch(/NODE_ENV === "production"[\s\S]*process\.exit\(2\)/);
    expect(launcher).toMatch(/api-m\.sandbox\.paypal\.com[\s\S]*process\.exit\(2\)/);
  });
  it("never constructs the real OpenAI or PayPal clients and announces that it is SIMULATED", () => {
    expect(launcher).not.toMatch(/createOpenAIInvoiceClient|PayPalSandboxClient|new OpenAI/);
    expect(launcher).toContain("SIMULATED EVALUATION MODE");
  });
});
