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
