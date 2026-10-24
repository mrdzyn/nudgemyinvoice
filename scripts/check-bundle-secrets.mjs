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
];
const walk = (d) =>
  readdirSync(d).flatMap((f) =>
    statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
  );
let bad = 0;
for (const file of walk(dist)) {
  const text = readFileSync(file, "utf8");
  for (const p of patterns)
    if (p.test(text)) {
      console.error(`${file}: matches ${p}`);
      bad++;
    }
}
if (bad) process.exit(1);
console.log(`Bundle secret scan clean (${walk(dist).length} files).`);
