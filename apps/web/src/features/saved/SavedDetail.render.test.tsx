import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProvider } from "../../demo/AppContext.js";
import { initialState, reducer } from "../../demo/appState.js";
import { FIXTURE_INVOICES } from "../../demo/fixtures.js";
import type { ServerInvoice } from "../../domain/serverInvoice.js";
import { isBlockedInRealMode } from "../../RealApp.js";
import { NO_SAVE, RealSaveNotices } from "../review/ReviewScreen.js";
import { SavedDetailScreen, SavedDetailView, type SavedLoad } from "./SavedDetailScreen.js";

/**
 * Objective: a saved record is shown only from the server's validated answer; failure states never
 * fall back to a fixture; PostgreSQL storage is never conflated with PayPal; real mode cannot reach
 * fixture records or simulated PayPal; the preview is untouched.
 */
const inv: ServerInvoice = {
  id: "0b0e7a52-8f73-4b1c-9c64-3a1d2f5a8e11",
  draft: {
    customerName: "Zeta Studio",
    customerEmail: "ap@zeta.example",
    currency: "EUR",
    lineItems: [{ description: "Brand audit", quantity: "1.5", unitPrice: "199.99" }],
    dueDate: "2030-03-01",
    taxPercent: "8.25",
    discount: null,
  },
  totals: {
    currency: "EUR",
    lineTotals: ["300.00"],
    subtotal: "300.00",
    discount: "0.00",
    tax: "24.75",
    total: "324.75",
  },
  paypalInvoiceId: null,
  replayed: false,
  createdAt: "2026-10-27T10:00:00.000Z",
  paypal: { state: "none", paypalInvoiceId: null, lastErrorCode: null },
};
const view = (load: SavedLoad, notice: "created" | "replayed" | "opened" = "created") =>
  renderToString(
    <SavedDetailView
      savedRef={{ id: inv.id, notice }}
      load={load}
      onRetry={() => undefined}
      onBack={() => undefined}
    />,
  ).replace(/<!-- -->/g, "");

describe("SavedDetailView", () => {
  it("shows the persisted record, its real UUID and server totals", () => {
    const html = view({ status: "ok", invoice: inv });
    for (const t of [
      "Zeta Studio",
      "ap@zeta.example",
      inv.id,
      "Saved in PostgreSQL",
      "€324.75",
      "€24.75",
      "Oct 27, 2026",
      "Mar 1, 2030",
    ])
      expect(html, t).toContain(t);
    expect(html).toContain("Server-computed");
  });
  it("distinguishes PostgreSQL from PayPal and implies no customer notification", () => {
    const html = view({ status: "ok", invoice: inv });
    expect(html).toContain("Not created in PayPal Sandbox");
    expect(html).toContain("was not created");
    expect(html).toContain("customer was not notified");
    expect(html).not.toMatch(/INV2-|Create PayPal Sandbox draft|Check status/);
    expect(html).not.toContain('<button type="button" class="btn btn-primary"');
  });
  it("shows a server-provided PayPal state read-only, with the server's id only", () => {
    const html = view({
      status: "ok",
      invoice: {
        ...inv,
        paypal: { state: "created", paypalInvoiceId: "INV2-REAL-ONE", lastErrorCode: null },
      },
    });
    expect(html).toContain("INV2-REAL-ONE");
    expect(html).not.toContain("fabricated");
  });
  it("explains a replay without claiming a second draft", () => {
    const html = view({ status: "ok", invoice: inv }, "replayed");
    expect(html).toContain("HTTP 200, replayed");
    expect(html).toContain("No second draft was created");
  });
  it("opened from the dashboard shows a neutral read-only notice: never 'saved just now' or a replay", () => {
    const html = view({ status: "ok", invoice: inv }, "opened");
    expect(html).toContain("opened from your list");
    expect(html).toContain("read-only view");
    expect(html).not.toMatch(
      /replayed|HTTP 200|just now|Saved in PostgreSQL\.|No second draft|was not created/,
    );
    expect(html).toContain("Zeta Studio");
    expect(html).toContain("€324.75");
  });
  it("created and replayed notices are unchanged for C3 saves", () => {
    expect(view({ status: "ok", invoice: inv }, "created")).toContain("Saved in PostgreSQL.");
    expect(view({ status: "ok", invoice: inv }, "replayed")).toContain("HTTP 200, replayed");
  });
  it("loading shows no invoice data", () => {
    const html = view({ status: "loading" });
    expect(html).toContain("Loading");
    expect(html).not.toContain("Zeta Studio");
    expect(html).not.toContain("Saved in PostgreSQL</span>");
  });
  it.each(["not-found", "offline", "unavailable", "malformed", "forbidden"] as const)(
    "%s shows an error and NEVER a fixture or the record",
    (status) => {
      const html = view({ status });
      expect(html).toContain("could not be shown");
      for (const f of FIXTURE_INVOICES) {
        expect(html).not.toContain(f.draft.customerName);
        expect(html).not.toContain(f.id);
      }
      expect(html).not.toContain("Zeta Studio");
      expect(html).not.toMatch(/Saved in PostgreSQL<\/span>/);
    },
  );
  it("renders server text as escaped text", () => {
    const html = view({
      status: "ok",
      invoice: { ...inv, draft: { ...inv.draft, customerName: "<img src=x onerror=alert(1)>" } },
    });
    expect(html).not.toContain("<img");
  });
});

const providerOf = (children: React.ReactNode, real: boolean) => (
  <AppProvider
    state={{ ...initialState("light"), screen: "saved", saved: { id: inv.id, notice: "created" } }}
    dispatch={() => undefined}
    session={
      real
        ? {
            username: "op",
            signOut: () => undefined,
            getInvoice: () => new Promise(() => undefined),
            save: NO_SAVE,
          }
        : null
    }
  >
    {children}
  </AppProvider>
);

describe("container isolation", () => {
  it("the preview (no session) renders nothing for a saved screen", () => {
    expect(renderToString(providerOf(<SavedDetailScreen />, false))).not.toContain("Saved");
  });
  it("real mode first paint is the loading state, not data", () => {
    const html = renderToString(providerOf(<SavedDetailScreen />, true));
    expect(html).toContain("Loading");
    expect(html).not.toContain("Zeta Studio");
  });
});

describe("real mode cannot reach fixtures or simulated PayPal", () => {
  it.each([
    [{ type: "open-detail", id: FIXTURE_INVOICES[0]!.id }],
    [{ type: "save-invoice", key: "k", draft: inv.draft, totals: inv.totals }],
    [{ type: "paypal-created", id: FIXTURE_INVOICES[0]!.id }],
    [{ type: "paypal-override", override: null }],
    [{ type: "navigate", screen: "detail" }],
    [{ type: "navigate", screen: "saved" }],
    [{ type: "navigate", screen: "review" }],
  ] as const)("blocks %j", (a) => expect(isBlockedInRealMode(a as never)).toBe(true));
  it.each([
    [{ type: "open-saved", id: inv.id, notice: "created" }],
    [{ type: "start-review", form: {}, source: "manual" }],
    [{ type: "navigate", screen: "composer" }],
    [{ type: "navigate", screen: "dashboard" }],
  ] as const)("allows %j", (a) => expect(isBlockedInRealMode(a as never)).toBe(false));
  it("open-saved lands on the saved screen with a clean composer and no review", () => {
    const s = reducer(initialState("light"), {
      type: "open-saved",
      id: inv.id,
      notice: "replayed",
    });
    expect(s.screen).toBe("saved");
    expect(s.saved).toEqual({ id: inv.id, notice: "replayed" });
    expect(s.review).toBeNull();
    expect(s.composer.text).toBe("");
  });
  it("opened is allowed; the dashboard row action dispatches it", () => {
    expect(isBlockedInRealMode({ type: "open-saved", id: inv.id, notice: "opened" } as never)).toBe(
      false,
    );
  });
});

describe("RealSaveNotices", () => {
  const rs = { useNewKey: () => undefined, abandonUncertain: () => undefined } as never;
  const render = (ui: Parameters<typeof RealSaveNotices>[0]["ui"]) =>
    renderToString(
      <RealSaveNotices ui={ui} rs={rs} announce={() => undefined} onRetry={() => undefined} />,
    ).replace(/<!-- -->/g, "");
  it("409 offers an explicit new key and keeps edits", () => {
    const h = render({ status: "conflict" });
    expect(h).toContain("409");
    expect(h).toContain("Use a new key and keep my edits");
    expect(h).toContain("Your edits are kept");
  });
  it.each(["timeout", "network", "server", "malformed"] as const)(
    "uncertain (%s) is not called a failure and offers same-request retry",
    (cause) => {
      const h = render({ status: "uncertain", cause });
      expect(h).toContain("could not confirm whether this draft was saved");
      expect(h).toContain("may or may not exist");
      expect(h).toContain("same key");
      expect(h).toContain("Retry the same save");
      expect(h).toContain("save as a new draft");
      expect(h).not.toContain("was not saved");
    },
  );
  it.each(["rejected", "invalid-draft", "forbidden"] as const)(
    "%s keeps edits and is generic",
    (reason) => {
      const h = render({ status: "failed", reason, messages: ["<b>x</b>"] });
      expect(h).toContain("The draft was not saved");
      expect(h).toContain("Your edits are kept");
      expect(h).not.toContain("<b>");
    },
  );
  it("idle and saving render nothing", () => {
    expect(render({ status: "idle" })).toBe("");
    expect(render({ status: "saving" })).toBe("");
  });
});
