import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportedDraftsView, initialImportsView, type ImportsViewState } from "./ImportedDrafts.js";
import type { ImportedDraftItem } from "../../paypal/importsApi.js";

const item = (id: string): ImportedDraftItem => ({
  remoteInvoiceId: id,
  invoiceNumber: "0001",
  currency: "USD",
  total: "5.00",
  dueDate: "2026-12-01",
  linkedInvoiceId: null,
  lastSyncedAt: "2026-11-08T12:00:00.000Z",
});

const html = (view: ImportsViewState) =>
  renderToString(<ImportedDraftsView view={view} onSync={() => undefined} />).replace(
    /<!-- -->/g,
    "",
  );

describe("ImportedDraftsView", () => {
  it("renders the sync action with loading, empty and disabled states", () => {
    const loading = html(initialImportsView);
    expect(loading).toContain("Sync PayPal Drafts");
    expect(loading).toContain("Loading imported drafts");

    const empty = html({ ...initialImportsView, phase: "ready", items: [] });
    expect(empty).toContain("No imported drafts yet");

    const disabled = html({ ...initialImportsView, phase: "disabled", syncDisabled: true });
    expect(disabled).toContain("switched off");
    expect(disabled).toMatch(/disabled/);
  });

  it("renders imported rows with counts, separate from invoice analytics", () => {
    const ready = html({
      ...initialImportsView,
      phase: "ready",
      items: [
        item("INV2-DRAFT-1"),
        { ...item("INV2-DRAFT-2"), linkedInvoiceId: "11111111-1111-4111-8111-111111111111" },
      ],
      counts: { created: 2, updated: 0, unchanged: 0, skipped: 0, failed: 0 },
      partialFailure: false,
    });
    expect(ready).toContain("INV2-DRAFT-1");
    expect(ready).toContain("Linked");
    expect(ready).toContain("Created 2");
    expect(ready).toContain("never added to those totals");
    expect(ready).not.toContain("partial failure");
  });

  it("surfaces partial failure while keeping earlier rows", () => {
    const partial = html({
      ...initialImportsView,
      phase: "sync-error",
      items: [item("INV2-DRAFT-1")],
      counts: { created: 1, updated: 0, unchanged: 0, skipped: 0, failed: 1 },
      partialFailure: true,
      notice: "sync-error",
    });
    expect(partial).toContain("INV2-DRAFT-1");
    expect(partial).toContain("partial failure");
    expect(partial).toContain("Try again");
  });

  it("surfaces truncation as incomplete without offering a no-progress retry", () => {
    const truncated = html({
      ...initialImportsView,
      phase: "ready",
      items: [item("INV2-DRAFT-1")],
      counts: { created: 20, updated: 0, unchanged: 0, skipped: 0, failed: 0 },
      partialFailure: true,
      truncated: true,
      notice: "truncated",
    });
    expect(truncated).toContain("INV2-DRAFT-1");
    expect(truncated).toContain("incomplete");
    expect(truncated).toContain("page cap");
    expect(truncated).not.toContain("Try again");
  });

  it("surfaces an audit failure with its kept rows and a retry", () => {
    const failed = html({
      ...initialImportsView,
      phase: "sync-error",
      items: [item("INV2-DRAFT-1")],
      counts: { created: 1, updated: 0, unchanged: 0, skipped: 0, failed: 0 },
      partialFailure: true,
      notice: "audit-failed",
    });
    expect(failed).toContain("INV2-DRAFT-1");
    expect(failed).toContain("audit trail");
    expect(failed).toContain("Try again");
  });

  it("disables the button while syncing and shows the active status", () => {
    const syncing = html({ ...initialImportsView, phase: "syncing", items: [item("INV2-X")] });
    expect(syncing).toContain("Syncing");
    expect(syncing).toMatch(/disabled|aria-busy/);
  });
});
