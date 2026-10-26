/* eslint-disable -- design-only Node tooling (not production code): uses Node globals and console output by design. */
// NMI-UI-01A design-only check. Not shipped, not imported by production code.
//
// Verifies that the synthetic design fixtures and the interactive preview stay truthful:
//   1. every fixture draft passes the real strict invoiceDraftSchema;
//   2. every stored total equals the real calculateTotals() result (packages/shared);
//   3. PayPal eligibility matches the real assertExactMapping() (packages/paypal);
//   4. the fixtures embedded in design/preview/index.html equal invoice-fixtures.json;
//   5. the preview has no inline on*= handlers and no genuine Sandbox smoke-test invoice id.
//
// Run (no network, no provider calls):
//   pnpm --filter @nmi/api exec -- node --import tsx ../../design/fixtures/verify-fixtures.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const { invoiceDraftSchema, calculateTotals } = await import(
  resolve(root, "packages/shared/src/index.ts")
);
const { assertExactMapping, PayPalMappingError } = await import(
  resolve(root, "packages/paypal/src/mapping.ts")
);

const TODAY = "2026-10-27"; // the preview's fixed "today"
const REAL_SMOKE_ID = ["INV2", "U92W", "76NX", "3P2E", "AGUZ"].join("-");

const fixtures = JSON.parse(readFileSync(resolve(here, "invoice-fixtures.json"), "utf8"));
let failures = 0;
const check = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures += 1;
};

const eligibility = (draft) => {
  try {
    assertExactMapping(draft, TODAY);
    return null;
  } catch (e) {
    if (e instanceof PayPalMappingError) return e.reason;
    throw e;
  }
};

const expectedEligibility = { USD: null, EUR: null, JPY: null, GBP: "tax_with_discount_multiline" };

for (const inv of fixtures.invoices) {
  const label = `${inv.draft.currency} ${inv.id.slice(0, 8)}`;
  const parsed = invoiceDraftSchema.safeParse(inv.draft);
  check(parsed.success, `${label}: draft passes strict invoiceDraftSchema`);
  if (!parsed.success) continue;
  const totals = calculateTotals(parsed.data);
  check(JSON.stringify(totals) === JSON.stringify(inv.totals), `${label}: stored totals equal calculateTotals()`);
  check(eligibility(parsed.data) === expectedEligibility[inv.draft.currency], `${label}: PayPal eligibility = ${expectedEligibility[inv.draft.currency] ?? "eligible"}`);
  check(inv.paypalInvoiceId === inv.paypal.paypalInvoiceId, `${label}: paypalInvoiceId consistent`);
  check(inv.paypalInvoiceId === null || /^INV2-DEMO-FAKE-/.test(inv.paypalInvoiceId), `${label}: PayPal id is clearly fabricated`);
}

for (const sc of fixtures.parseScenarios) {
  for (const key of ["outcome", "afterClarification"]) {
    const o = sc[key];
    if (!o || o.status !== "draft") continue;
    const parsed = invoiceDraftSchema.safeParse(o.draft);
    check(parsed.success, `scenario ${sc.id}.${key}: draft passes schema`);
    if (parsed.success) {
      check(JSON.stringify(calculateTotals(parsed.data)) === JSON.stringify(o.totals), `scenario ${sc.id}.${key}: totals equal calculateTotals()`);
    }
  }
  check(sc.text.length <= 2000, `scenario ${sc.id}: sample text within the 2,000-character limit`);
}

const html = readFileSync(resolve(root, "design/preview/index.html"), "utf8");
const embedded = /<script id="nmi-fixtures" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
check(Boolean(embedded) && JSON.stringify(JSON.parse(embedded[1])) === JSON.stringify(fixtures), "preview embeds fixtures identical to invoice-fixtures.json");
check(!/\son[a-z]+\s*=\s*["']/i.test(html), "preview has no inline on*= event-handler attributes");
check(!/javascript:/i.test(html), "preview has no javascript: URLs");

for (const rel of ["design/preview/index.html", "design/fixtures/invoice-fixtures.json", "design/screens/NMI-UI-01A-SCREENS.md", "docs/STATUS.md"]) {
  const text = readFileSync(resolve(root, rel), "utf8");
  if (rel === "docs/STATUS.md") continue; // STATUS legitimately records the real smoke id as accepted evidence
  check(!text.includes(REAL_SMOKE_ID), `${rel}: does not contain the genuine Sandbox smoke invoice id`);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
