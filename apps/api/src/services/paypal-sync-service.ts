import { isSupportedCurrency, parseMoney } from "@nmi/shared";
import {
  PAYPAL_SYNC_MAX_PAGE_SIZE,
  type PayPalInvoicingReadDraft,
  type RemoteInvoice,
} from "@nmi/paypal";
import type { AuditSink, PostgresInvoiceDraftStore, PostgresPayPalImportStore } from "@nmi/db";

export interface PayPalSyncCounts {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

export interface PayPalSyncDeps {
  /** Read-only use: reconciling by verified remote id. The sync NEVER writes here. */
  drafts: PostgresInvoiceDraftStore;
  imports: PostgresPayPalImportStore;
  paypal: PayPalInvoicingReadDraft;
  audit: AuditSink;
  clock?: (() => Date) | undefined;
  /** Bounded pagination: at most this many list pages per manual sync. Defaults to 25. */
  maxPages?: number | undefined;
  /** List page size. Defaults to 20; never above the transport cap. */
  pageSize?: number | undefined;
}

const DEFAULT_MAX_PAGES = 25;
const DUE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Manually initiated, one-way PayPal Sandbox DRAFT import into PostgreSQL.
 *
 * Safety shape:
 * - READ-ONLY toward PayPal: only the allowlisted paginated list operation runs. No send,
 *   remind, cancel, pay, capture, refund, update or delete path exists in the adapter.
 * - Only validated DRAFT records are stored; anything else is counted as skipped, never kept.
 * - Money is parsed with the currency-specific exact parser; unparseable amounts are skipped.
 * - The sync writes ONLY to `paypal_imported_drafts`. Local invoice bodies and the fenced
 *   `paypal_draft_operations` state machine are read at most, never modified.
 * - Reconciliation links an import to a local invoice ONLY when the verified remote id matches
 *   an operator-owned local row AND currency + exact total agree; otherwise it stays unlinked.
 * - Every record is independent: one bad row or one failed page never rolls back the rest.
 */
export async function syncPaypalDrafts(
  deps: PayPalSyncDeps,
  input: { operatorId: string; requestId: string },
): Promise<{ counts: PayPalSyncCounts; syncedAt: Date }> {
  const pageSize = Math.min(
    Math.max(Math.trunc(deps.pageSize ?? PAYPAL_SYNC_MAX_PAGE_SIZE), 1),
    PAYPAL_SYNC_MAX_PAGE_SIZE,
  );
  const maxPages = Math.min(Math.max(Math.trunc(deps.maxPages ?? DEFAULT_MAX_PAGES), 1), 25);
  const counts: PayPalSyncCounts = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };

  for (let page = 1; page <= maxPages; page++) {
    let list;
    try {
      list = await deps.paypal.listInvoices({ page, pageSize });
    } catch {
      // One failed page ends the run; everything already upserted stays committed.
      counts.failed += 1;
      break;
    }
    counts.skipped += list.skippedMalformed;
    for (const remote of list.invoices) {
      await importOne(deps, input.operatorId, remote, counts);
    }
    const seen = page * pageSize;
    if (
      list.invoices.length < pageSize ||
      seen >= list.totalItems ||
      (list.totalPages !== null && page >= list.totalPages)
    ) {
      break;
    }
  }

  const syncedAt = deps.clock ? deps.clock() : new Date();
  // Audit keeps only closed-token detail (no PII, no amounts); the exact counts travel in the
  // authenticated API response, never in logs.
  await deps.audit
    .record({
      requestId: input.requestId,
      actor: input.operatorId,
      action: "paypal.draft_sync",
      outcome: counts.failed > 0 ? "error" : "success",
      detail: { state: counts.failed > 0 ? "partial_failure" : "complete" },
    })
    .catch(() => undefined);
  return { counts, syncedAt };
}

async function importOne(
  deps: PayPalSyncDeps,
  operatorId: string,
  remote: RemoteInvoice,
  counts: PayPalSyncCounts,
): Promise<void> {
  // Accept only DRAFT records; every other remote state is observed and skipped.
  if (remote.status !== "DRAFT") {
    counts.skipped += 1;
    return;
  }
  if (!isSupportedCurrency(remote.currency)) {
    counts.skipped += 1;
    return;
  }
  let totalMinor: bigint;
  try {
    totalMinor = parseMoney(remote.total, remote.currency);
  } catch {
    counts.skipped += 1;
    return;
  }
  // Strict calendar validation: shape plus a UTC round-trip, so values the SQL date type
  // would reject (month 13, day 45, ...) are skipped, never attempted.
  let dueDate: string | null = null;
  if (remote.dueDate !== null) {
    if (!DUE_DATE.test(remote.dueDate)) {
      counts.skipped += 1;
      return;
    }
    const instant = Date.parse(`${remote.dueDate}T00:00:00Z`);
    if (!Number.isFinite(instant)) {
      counts.skipped += 1;
      return;
    }
    const roundTrip = new Date(instant).toISOString().slice(0, 10);
    if (roundTrip !== remote.dueDate) {
      counts.skipped += 1;
      return;
    }
    dueDate = remote.dueDate;
  }
  const invoiceNumber =
    remote.invoiceNumber !== null && remote.invoiceNumber.length <= 25
      ? remote.invoiceNumber
      : null;

  // Reconcile by verified id + matching values only. Never writes to local invoices.
  let linkedInvoiceId: string | null = null;
  try {
    const local = await deps.drafts.findOwnedByPayPalId(operatorId, remote.paypalInvoiceId);
    if (local && local.currency === remote.currency && local.totalMinor === totalMinor) {
      linkedInvoiceId = local.id;
    }
  } catch {
    counts.failed += 1;
    return;
  }

  try {
    const result = await deps.imports.upsert({
      operatorId,
      paypalEnv: "sandbox",
      remoteInvoiceId: remote.paypalInvoiceId,
      invoiceNumber,
      currency: remote.currency,
      totalMinor,
      dueDate,
      linkedInvoiceId,
    });
    if (result.outcome === "owner_conflict") {
      // Another operator already mirrors this remote id: leave their row untouched.
      counts.skipped += 1;
      return;
    }
    counts[result.outcome] += 1;
  } catch {
    counts.failed += 1;
  }
}
