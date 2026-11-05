// Fails if the built web bundle contains anything that looks like a server-side secret.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const dist = "apps/web/dist";
if (!existsSync(dist)) {
  console.error(`No build found at ${dist}; run pnpm build first.`);
  process.exit(1);
}
// P5: which build is being checked. Must match the NMI_WEB_STUDIO value the build used; a mismatch fails closed
// (a licensed build scanned as Community trips the Studio markers; a Community build scanned as licensed has no
// Studio chunk).
const rawVariant = process.env["NMI_WEB_STUDIO"] ?? "";
if (rawVariant !== "" && rawVariant !== "licensed") {
  console.error('NMI_WEB_STUDIO must be unset (Community build) or exactly "licensed".');
  process.exit(1);
}
const licensedVariant = rawVariant === "licensed";

const patterns = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /OPENAI_API_KEY/,
  /PAYPAL_CLIENT_SECRET/,
  /SESSION_SECRET/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  // The dev-only licence bridge and the licence variable name never belong in ANY built bundle.
  /__nmi_dev/,
  /studio-licence/,
  /x-nmi-dev-studio/,
  /AG_STUDIO_LICENSE_KEY/,
];
// A5-I1: an ordinary (Community) production build contains no licensed AG Studio code at all. (The community
// grid's own "ag-grid-enterprise script" error text is deliberately not a marker.)
const studioMarkers = [/ag-studio/i, /AgStudio/, /ag-charts-enterprise/];
if (!licensedVariant) patterns.push(...studioMarkers);
const walk = (d) =>
  readdirSync(d).flatMap((f) =>
    statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
  );
let bad = 0;

// If a local licence key exists (process env or the untracked .env.local), also check, as a yes/no only, that
// its VALUE is not in any build file. Only that one line is read; the value is never printed or logged.
function localLicenceKey() {
  if (process.env["AG_STUDIO_LICENSE_KEY"]) return process.env["AG_STUDIO_LICENSE_KEY"];
  for (const file of [".env.local", "apps/web/.env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?AG_STUDIO_LICENSE_KEY\s*=\s*(.*?)\s*$/.exec(line);
      if (m) return (m[1] ?? "").replace(/^(["'])(.*)\1$/, "$2") || null;
    }
  }
  return null;
}
const licence = localLicenceKey();
let licenceChecked = false;

for (const file of walk(dist)) {
  const text = readFileSync(file, "utf8");
  if (licence) {
    licenceChecked = true;
    if (text.includes(licence)) {
      console.error(`${file}: contains the local AG Studio licence key (value not shown)`);
      bad++;
    }
  }
  for (const p of patterns)
    if (p.test(text)) {
      console.error(`${file}: matches ${p}`);
      bad++;
    }
}
// P5 licensed variant: Studio MUST be present, and only in lazily loaded chunks — never in the HTML shell or in
// any script the shell loads directly (the sign-in page must not carry it).
let studioFiles = 0;
if (licensedVariant) {
  const shell = readFileSync(join(dist, "index.html"), "utf8");
  const direct = new Set(
    [...shell.matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)].map((m) =>
      join(dist, m[1] ?? ""),
    ),
  );
  for (const file of walk(dist)) {
    if (!file.endsWith(".js")) continue;
    const text = readFileSync(file, "utf8");
    if (!studioMarkers.some((p) => p.test(text))) continue;
    studioFiles++;
    if (direct.has(file)) {
      console.error(
        `${file}: licensed AG Studio code is loaded by the HTML shell instead of lazily`,
      );
      bad++;
    }
  }
  if (studioFiles === 0) {
    console.error("NMI_WEB_STUDIO=licensed but the build contains no AG Studio chunk");
    bad++;
  }
}

if (bad) process.exit(1);
console.log(
  `Bundle secret scan clean (${walk(dist).length} files, ${licensedVariant ? `licensed variant: Studio in ${studioFiles} lazy chunk(s)` : "Community variant: no Studio code"})${licenceChecked ? "; local AG Studio licence value absent from every file" : ""}.`,
);
