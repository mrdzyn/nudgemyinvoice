/**
 * P5 SEC-N1: the EXACT vendor stylesheets AG Studio 3.0.0 injects without forwarding its `styleNonce`, allowed by
 * content hash instead of the earlier page-wide `createElement` nonce shim (removed). Every other <style> element —
 * script-created, parser-injected or with a wrong nonce — stays blocked, and style attributes stay blocked.
 *
 * Provenance (captured 2026-11-05 from Chrome's CSP reports and the blocked elements' text, licensed production
 * build, desktop + 390px + dark theme; identical across runs):
 *   - AG Charts Community stylesheet, `<style data-ag-charts="ag-charts-community">`, 57,088 chars;
 *   - AG Charts Enterprise stylesheet, `<style data-ag-charts="ag-charts-enterprise">`, 31,898 chars;
 *   - AG Studio colour sensor: `@property --ag-studio-color-change { syntax: '<color>'; inherits: true;
 *     initial-value: transparent; }`;
 *   - the empty string: AG Charts inserts its <style> empty, then fills it (an empty sheet applies nothing).
 *
 * The hashes are valid ONLY for the pinned versions below (a test fails if the lockfile moves). On any upgrade,
 * recapture with `P5_COLLECT_HASHES=1 node design/evidence/NMI-P5/run-licensed-production-qa.mjs`; the production
 * QA fails on any CSP violation, so drift cannot pass silently.
 */
export const STUDIO_STYLE_HASH_VERSIONS = {
  "ag-studio": "3.0.0",
  "ag-charts-community": "14.2.0",
  "ag-charts-enterprise": "14.2.0",
} as const;

export const STUDIO_STYLE_HASHES = [
  "sha256-gFhlONN7LEyfyY478NiUzvXS0/XFt07LeQXXIpYVfZo=",
  "sha256-nbXpXHHmAf92rUhkdb3Ydxs/7nySPckbQ+oqXxq5aWY=",
  "sha256-ydedGqCb79ipYJuuWRyOTMrKbkjYWv8WIjG7SRdnEPU=",
  "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
] as const;
