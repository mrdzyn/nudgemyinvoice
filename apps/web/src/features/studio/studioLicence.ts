/**
 * Development-only licence fetch (A5-I1). The key is NEVER bundled: the Vite DEV server (vite.studio-dev.ts)
 * answers this loopback-only request at runtime, and only when VITE_NMI_STUDIO_LOCAL=1. Nothing here runs in a
 * production build, where the whole Studio slot is removed. Missing/blocked/unknown answers mean "no key", which
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
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "licenseKey" in body) {
      const key = (body as { licenseKey: unknown }).licenseKey;
      return typeof key === "string" && key.length > 0 ? key : null;
    }
    return null;
  } catch {
    return null;
  }
}
