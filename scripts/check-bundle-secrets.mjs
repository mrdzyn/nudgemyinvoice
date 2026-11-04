// Fails if the built web bundle contains anything that looks like a server-side secret.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const dist = "apps/web/dist";
if (!existsSync(dist)) {
  console.error(`No build found at ${dist}; run pnpm build first.`);
  process.exit(1);
}
const patterns = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /OPENAI_API_KEY/,
  /PAYPAL_CLIENT_SECRET/,
  /SESSION_SECRET/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  // A5-I1: the licensed AG Studio packages, their dev-only licence bridge and the licence variable exist only
  // in the local dev server. An ordinary production build must contain none of them. (The community grid's own
  // "ag-grid-enterprise script" error text is deliberately not a marker.)
  /ag-studio/i,
  /AgStudio/,
  /ag-charts-enterprise/,
  /__nmi_dev/,
  /studio-licence/,
  /AG_STUDIO/,
];
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
if (bad) process.exit(1);
console.log(
  `Bundle secret scan clean (${walk(dist).length} files)${licenceChecked ? "; local AG Studio licence value absent from every file" : ""}.`,
);
