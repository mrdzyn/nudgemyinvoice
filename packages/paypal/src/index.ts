import type { CurrencyCode, InvoiceDraft } from "@nmi/shared";
import type { PrivilegedAction } from "@nmi/domain";

/** The only PayPal host this project may talk to. Live hosts are rejected, never fallen back to. */
export const PAYPAL_SANDBOX_HOST = "api-m.sandbox.paypal.com";

export class SandboxConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxConfigError";
  }
}

export function assertSandboxConfig(env: {
  PAYPAL_ENV?: string | undefined;
  PAYPAL_API_BASE_URL?: string | undefined;
}): URL {
  if (env.PAYPAL_ENV !== "sandbox")
    throw new SandboxConfigError("PAYPAL_ENV must be exactly 'sandbox'");
  let url: URL;
  try {
    url = new URL(env.PAYPAL_API_BASE_URL ?? "");
  } catch {
    throw new SandboxConfigError("PAYPAL_API_BASE_URL is not a valid URL");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== PAYPAL_SANDBOX_HOST ||
    url.port ||
    url.username ||
    url.password
  ) {
    throw new SandboxConfigError(`PAYPAL_API_BASE_URL must be https://${PAYPAL_SANDBOX_HOST}`);
  }
  return url;
}

export type RemoteInvoiceStatus =
  "DRAFT" | "SENT" | "PAID" | "PARTIALLY_PAID" | "CANCELLED" | "REFUNDED" | "UNKNOWN";

export interface RemoteInvoice {
  paypalInvoiceId: string;
  status: RemoteInvoiceStatus;
  currency: CurrencyCode;
  total: string;
  dueDate: string;
}

/** Read and draft operations: the only PayPal surface an agent may reach. No send/cancel/refund here. */
export interface PayPalInvoicingReadDraft {
  createDraftInvoice(draft: InvoiceDraft): Promise<RemoteInvoice>;
  getInvoice(paypalInvoiceId: string): Promise<RemoteInvoice>;
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
