import type { PrivilegedAction } from "@nmi/domain";
import type { RemoteInvoice } from "./client.js";

export * from "./sandbox.js";

export * from "./http.js";
export * from "./mapping.js";
export * from "./client.js";

/**
 * Read and draft operations: the only PayPal surface this project may use. There is deliberately no
 * send, remind, cancel, payment, refund, update or delete method here, in the client, or in the
 * transport allowlist.
 */
export interface PayPalInvoicingReadDraft {
  createDraftInvoice(input: {
    body: import("./mapping.js").PayPalInvoiceRequest;
    requestId: string;
  }): Promise<{ paypalInvoiceId: string }>;
  getInvoice(paypalInvoiceId: string): Promise<RemoteInvoice | null>;
  findInvoiceIdsByNumber(invoiceNumber: string): Promise<string[]>;
}

/**
 * Proof that backend approval code verified and consumed a grant for this exact action.
 * Only the approval service may mint it (the brand is not exported as a constructor).
 */
declare const approvedBrand: unique symbol;
export interface ApprovedAction<A extends PrivilegedAction = PrivilegedAction> {
  readonly [approvedBrand]: true;
  readonly action: A;
  readonly resourceId: string;
  readonly payloadDigest: string;
}

/** Privileged surface. Interface only in NMI-P1: no implementation is provided or wired. */
export interface PayPalInvoicingPrivileged {
  sendInvoice(approved: ApprovedAction<"sendInvoice">): Promise<RemoteInvoice>;
}
