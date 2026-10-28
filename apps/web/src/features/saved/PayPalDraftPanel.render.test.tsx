import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "../../demo/AppContext.js";
import { initialState } from "../../demo/appState.js";
import { FIXTURE_INVOICES } from "../../demo/fixtures.js";
import type { ServerInvoice, ServerPayPalState } from "../../domain/serverInvoice.js";
import type { PayPalDraftResult } from "../../invoices/api.js";
import { initialPanel, type PanelUi } from "../../invoices/paypalPanel.js";
import { PayPalDraftPanel, PayPalDraftPanelView } from "./PayPalDraftPanel.js";
import { SavedDetailScreen, SavedDetailView } from "./SavedDetailScreen.js";

/**
 * Objective: the real PayPal Sandbox panel tells the truth in every state: a saved-only invoice is
 * "not created in PayPal"; a created draft is a DRAFT that was not sent; uncertain means "may or may
 * not exist"; mismatch offers no retry; disabled is not re-probed; the confirmation names the exact
 * invoice, currency and server-computed total and says nothing is emailed or collected. Server-render
 * tests (no network); the browser journey covers clicks, focus and Escape.
 */
const ID = "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11";
const inv = (
  pp: Partial<ServerPayPalState> = {},
  currency: "EUR" | "JPY" | "USD" = "EUR",
): ServerInvoice => {
  const jpy = currency === "JPY";
  return {
    id: ID,
    draft: {
      customerName: "Zeta Studio",
      customerEmail: "ap@zeta.example",
      currency,
      lineItems: [
        { description: "Brand audit", quantity: "1", unitPrice: jpy ? "5000" : "300.00" },
      ],
      dueDate: "2030-03-01",
      taxPercent: null,
      discount: null,
    },
    totals: {
      currency,
      lineTotals: [jpy ? "5000" : "300.00"],
      subtotal: jpy ? "5000" : "300.00",
      discount: jpy ? "0" : "0.00",
      tax: jpy ? "0" : "0.00",
      total: jpy ? "5000" : "300.00",
    },
    paypalInvoiceId: null,
    replayed: false,
    createdAt: "2026-10-27T10:00:00.000Z",
    paypal: { state: "none", paypalInvoiceId: null, lastErrorCode: null, ...pp },
  };
};
const noop = () => undefined;
const view = (invoice: ServerInvoice, ui: Partial<PanelUi> = {}) =>
  renderToString(
    <PayPalDraftPanelView
      invoice={invoice}
      ui={{ ...initialPanel, ...ui }}
      onOpen={noop}
      onCancel={noop}
      onConfirm={noop}
      onCheck={noop}
    />,
  ).replace(/<!-- -->/g, "");
const NEVER_CLAIMS =
  /(has been|was|were|is) (sent|paid|emailed)|payment (received|collected)|Invoice sent/i;

describe("durable states", () => {
  it("none: saved only, explicit create action, no PayPal id, nothing implied as sent", () => {
    const h = view(inv());
    expect(h).toContain("Not created in PayPal Sandbox");
    expect(h).toContain("Create PayPal Sandbox draft…");
    expect(h).toContain("saved in PostgreSQL only");
    expect(h).toContain("does <strong>not</strong>");
    expect(h).not.toMatch(/INV2-/);
    expect(h).not.toMatch(NEVER_CLAIMS);
  });
  it("created: the server's id, DRAFT, customer not emailed, no create button", () => {
    const h = view(inv({ state: "created", paypalInvoiceId: "INV2-REAL-ONE" }));
    expect(h).toContain("INV2-REAL-ONE");
    expect(h).toContain("DRAFT");
    expect(h).toContain("The customer has not been emailed");
    expect(h).toContain("PayPal draft created");
    expect(h).not.toContain("create-pp-btn");
    expect(h).not.toMatch(NEVER_CLAIMS);
    expect(h).not.toMatch(/fabricated|DEMO-FAKE/);
  });
  it.each(["pending", "creating"] as const)(
    "%s: in progress, Check status only, no create",
    (state) => {
      const h = view(inv({ state }));
      expect(h).toContain("Creation in progress");
      expect(h).toContain("check-pp-btn");
      expect(h).not.toContain("create-pp-btn");
    },
  );
  it("unknown: says a draft may or may not exist, offers Check status and an explicit retry", () => {
    const h = view(inv({ state: "unknown", lastErrorCode: "timeout" }));
    expect(h).toContain("A PayPal draft may or may not exist");
    expect(h).toContain("neither a failure nor a success");
    expect(h).toContain("check-pp-btn");
    expect(h).toContain("Retry (checks PayPal first)…");
    expect(h).toContain("timeout");
    expect(h).not.toContain("PayPal draft created");
  });
  it("rejected: preserved invoice, explicit Try again", () => {
    const h = view(inv({ state: "rejected", lastErrorCode: "paypal_validation_error" }));
    expect(h).toContain("PayPal rejected the request");
    expect(h).toContain("No draft was created");
    expect(h).toContain("Try again…");
    expect(h).toContain("paypal_validation_error");
  });
  it("mismatch: an alert requiring manual investigation and NO retry", () => {
    const h = view(inv({ state: "mismatch", lastErrorCode: "payload_digest_mismatch" }));
    expect(h).toContain('role="alert"');
    expect(h).toContain("Manual investigation required");
    expect(h).toContain("offers no retry");
    expect(h).not.toContain("create-pp-btn");
    expect(h).toContain("payload_digest_mismatch");
  });
});

describe("transient UI states", () => {
  it("creating: accessible progress and no second action", () => {
    const h = view(inv(), { phase: "creating" });
    expect(h).toContain('role="status"');
    expect(h).toContain("Creating the PayPal Sandbox draft");
    expect(h).toContain('aria-busy="true"');
    expect(h).not.toContain("create-pp-btn");
  });
  it("disabled seen: explained, local invoice usable, and create is not offered again", () => {
    const h = view(inv(), { disabledSeen: true, outcome: { kind: "disabled" } });
    expect(h).toContain("switched off on the server");
    expect(h).toContain("Your local invoices keep working");
    expect(h).toMatch(/id="create-pp-btn"[^>]*disabled/);
  });
  it("unverified after an uncertain answer: no 'not created' claim and no create, only Check status", () => {
    const h = view(inv(), { unverified: true, outcome: { kind: "uncertain", cause: "network" } });
    expect(h).toContain("A PayPal draft may or may not exist");
    expect(h).toContain("Saved state not yet confirmed");
    expect(h).toContain("check-pp-btn");
    expect(h).not.toContain("create-pp-btn");
    expect(h).not.toContain("Not created in PayPal Sandbox");
  });
  it("a failed read-back warns the state may be stale", () => {
    const h = view(inv(), { readFailed: true });
    expect(h).toContain("could not be re-read");
    expect(h).toContain("Nothing was created by this check");
  });
});

describe("POST outcome notices", () => {
  const out = (outcome: PayPalDraftResult, durable: Partial<ServerPayPalState> = {}) =>
    view(inv(durable), { outcome });
  it("created (new): validated id, DRAFT, not sent", () => {
    const h = out(
      { kind: "created", paypalInvoiceId: "INV2-NEW-1", replayed: false },
      { state: "created", paypalInvoiceId: "INV2-NEW-1" },
    );
    expect(h).toContain("PayPal Sandbox DRAFT created (HTTP 201)");
    expect(h).toContain("INV2-NEW-1");
    expect(h).toContain("It was not sent");
    expect(h).toContain("no payment was requested or collected");
    expect(h).not.toMatch(NEVER_CLAIMS);
  });
  it("created (replay): says it already existed and no second draft was created", () => {
    const h = out(
      { kind: "created", paypalInvoiceId: "INV2-OLD-1", replayed: true },
      { state: "created", paypalInvoiceId: "INV2-OLD-1" },
    );
    expect(h).toContain("already existed (HTTP 200, replayed)");
    expect(h).toContain("No second draft was created");
  });
  it("in-progress / reconciliation-pending: no automatic create, refresh is read-only", () => {
    expect(out({ kind: "in-progress" })).toContain("will not be repeated automatically");
    const r = out({ kind: "reconciliation-pending" });
    expect(r).toContain("avoiding a duplicate draft");
    expect(r).toContain("No new create request was made");
  });
  it.each([
    ["rounding_required_line", "line total"],
    ["rounding_required_tax", "tax amount"],
    ["rounding_required_discount", "percent discount"],
    ["tax_with_discount_multiline", "single-line invoices"],
    ["due_date_past", "due date is in the past"],
    ["invalid_invoice_date", "invoice date"],
  ] as const)(
    "mapping refused (%s): the safe server reason, no silent rounding",
    (reason, copy) => {
      const h = out({ kind: "mapping-refused", reason });
      expect(h).toContain("mapping_refused");
      expect(h).toContain(copy);
      expect(h).toContain("never rounds silently");
      expect(h).toContain("local invoice is unchanged");
    },
  );
  it("paypal-unknown and uncertain say 'may or may not exist', never failure or success", () => {
    for (const o of [
      { kind: "paypal-unknown", code: "timeout" },
      { kind: "uncertain", cause: "timeout" },
      { kind: "uncertain", cause: "network" },
      { kind: "uncertain", cause: "malformed" },
      { kind: "uncertain", cause: "server" },
    ] as PayPalDraftResult[]) {
      const h = out(o);
      expect(h).toContain("may or may not exist");
      expect(h).not.toContain("PayPal Sandbox DRAFT created");
      expect(h).not.toMatch(/failed to create|was not created/i);
    }
    expect(out({ kind: "uncertain", cause: "network" })).toContain("nothing is retried");
  });
  it("rejected and mismatch outcomes are alerts", () => {
    expect(out({ kind: "paypal-rejected", code: "paypal_validation_error" })).toContain(
      "PayPal rejected the request",
    );
    expect(out({ kind: "paypal-mismatch", code: "payload_digest_mismatch" })).toContain(
      "does not match this invoice",
    );
  });
  it("forbidden / not-found / bad-request / unavailable fail closed and claim nothing was created or its state is unknown", () => {
    expect(out({ kind: "forbidden" })).toContain("Nothing was created");
    expect(out({ kind: "not-found" })).toContain("Nothing was created");
    expect(out({ kind: "bad-request" })).toContain("Nothing was created");
    expect(out({ kind: "unavailable" })).toContain("not known whether a draft was started");
    for (const k of ["forbidden", "not-found", "bad-request"] as const)
      expect(out({ kind: k })).not.toMatch(/INV2-|DRAFT created/);
  });
  it("401 and aborted render no notice (401 ends the session elsewhere)", () => {
    expect(out({ kind: "unauthorized" })).not.toContain("pp-outcome");
    expect(out({ kind: "aborted" })).not.toContain("pp-outcome");
  });
  it("server-authored codes render as escaped text", () => {
    const h = view(inv({ state: "rejected", lastErrorCode: "x" }), {
      outcome: { kind: "paypal-rejected", code: "a_b" },
    });
    expect(h).not.toContain("<img");
  });
});

describe("confirmation dialog content", () => {
  it.each([
    ["EUR", "€300.00", "EUR"],
    ["JPY", "¥5,000", "JPY"],
    ["USD", "$300.00", "USD"],
  ] as const)(
    "names the exact invoice, customer, %s total and due date, and the safety statements",
    (cur, total, code) => {
      const h = view(inv({}, cur), { phase: "confirming" });
      expect(h).toContain("Create a PayPal Sandbox draft?");
      expect(h).toContain(ID);
      expect(h).toContain("Zeta Studio");
      expect(h).toContain(total);
      expect(h).toContain(`</strong> ${code}`);
      expect(h).toContain("Mar 1, 2030");
      expect(h).toContain("The customer will not be emailed");
      expect(h).toContain("No payment will be collected");
      expect(h).toContain("does not send an invoice");
      expect(h).toContain("only because you confirm it here");
      expect(h).toContain("Create PayPal Sandbox draft</button>");
      expect(h).toContain(">Cancel</button>");
      expect(h).toContain("Sandbox");
    },
  );
});

describe("no automatic request, preview isolation, no persistence", () => {
  it("rendering the connected panel never calls create or refresh", () => {
    const create = vi.fn(() => Promise.resolve({ kind: "aborted" } as PayPalDraftResult));
    const refresh = vi.fn(() => Promise.resolve("ok" as const));
    renderToString(
      <PayPalDraftPanel invoice={inv()} create={create} refresh={refresh} onExpired={noop} />,
    );
    expect(create).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("without the real capability the saved view is read-only: no create or check button, no fixture id", () => {
    const h = renderToString(
      <SavedDetailView
        savedRef={{ id: ID, notice: "opened" }}
        load={{ status: "ok", invoice: inv({ state: "created", paypalInvoiceId: "INV2-SRV-1" }) }}
        onRetry={noop}
        onBack={noop}
      />,
    );
    expect(h).toContain("INV2-SRV-1");
    expect(h).not.toMatch(/create-pp-btn|check-pp-btn/);
  });
  it("the synthetic preview never renders the real saved screen or panel", () => {
    const h = renderToString(
      <AppProvider
        state={{ ...initialState("light"), screen: "saved", saved: { id: ID, notice: "opened" } }}
        dispatch={noop}
        session={null}
      >
        <SavedDetailScreen />
      </AppProvider>,
    );
    expect(h).not.toMatch(/PayPal Sandbox draft|create-pp-btn/);
    for (const f of FIXTURE_INVOICES) expect(h).not.toContain(f.draft.customerName);
  });
  it("source: exactly one runner.start (in the confirm handler); no browser storage; no fixture import", () => {
    const src = readFileSync(join(import.meta.dirname, "PayPalDraftPanel.tsx"), "utf8");
    expect(src.match(/runner\.start\(/g)).toHaveLength(1);
    expect(src.slice(src.indexOf("onConfirm={"), src.indexOf("onCheck={"))).toContain(
      "runner.start(",
    );
    expect(src).not.toMatch(
      /localStorage|sessionStorage|indexedDB|document\.cookie|demo\/fixtures|setInterval/,
    );
  });
  it("the saved screen's notices no longer claim 'nothing was sent to PayPal' after a draft can exist", () => {
    for (const notice of ["created", "replayed", "opened"] as const) {
      const h = renderToString(
        <SavedDetailView
          savedRef={{ id: ID, notice }}
          load={{ status: "ok", invoice: inv({ state: "created", paypalInvoiceId: "INV2-SRV-1" }) }}
          onRetry={noop}
          onBack={noop}
        />,
      ).replace(/<!-- -->/g, "");
      expect(h).not.toMatch(
        /nothing was sent to PayPal|was not created in PayPal|not a PayPal invoice/i,
      );
    }
  });
});
