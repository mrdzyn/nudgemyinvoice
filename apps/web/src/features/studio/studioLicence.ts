/**
 * Production licence fetch (P5 licensed build). The key is released only to the signed-in operator by the API
 * (`GET /api/studio/licence`, custom header, same-origin cookie, `no-store`). It lives in React state only: never
 * logged, stored in web storage or put in a URL. Any failure (401, 404 not configured, network) means "no key",
 * which the production panel treats as "Charts unavailable" rather than rendering an unlicensed Studio.
 */
export async function fetchProdLicenceKey(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/api/studio/licence", {
      headers: { "x-nmi-studio": "1" },
      cache: "no-store",
      credentials: "same-origin",
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return null;
    return keyFrom(await res.json());
  } catch {
    return null;
  }
}

function keyFrom(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "licenseKey" in body) {
    const key = (body as { licenseKey: unknown }).licenseKey;
    return typeof key === "string" && key.length > 0 ? key : null;
  }
  return null;
}

/**
 * The dev server uses the loopback bridge; every built bundle uses the authenticated API. `import.meta.env.DEV` is a
 * build-time constant, so the dev bridge and its path are removed from production bundles (the bundle scan checks).
 */
export const fetchStudioLicenceKey: (signal?: AbortSignal) => Promise<string | null> = import.meta
  .env.DEV
  ? fetchDevLicenceKey
  : fetchProdLicenceKey;

/** Production must never fall back to an unlicensed Studio; local development may (A5-I1 evaluation). */
export const studioLicenceRequired = !import.meta.env.DEV;

/**
 * Development-only licence fetch (A5-I1). The key is NEVER bundled: the Vite DEV server (vite.studio-dev.ts)
 * answers this loopback-only request at runtime, and only when VITE_NMI_STUDIO_LOCAL=1. It is unreachable in every
 * built bundle (see fetchStudioLicenceKey). Missing/blocked/unknown answers mean "no key", which
 * leaves Studio in its unlicensed (watermarked) evaluation mode; the value is never logged or stored.
 */
export async function fetchDevLicenceKey(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/__nmi_dev/studio-licence", {
      headers: { "x-nmi-dev-studio": "1" },
      cache: "no-store",
      credentials: "omit",
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return null;
    return keyFrom(await res.json());
  } catch {
    return null;
  }
}
