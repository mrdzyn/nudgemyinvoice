import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ViteDevServer } from "vite";
import { readStudioLicenceKey, studioDevLicence } from "../../../vite.studio-dev.js";

/**
 * Objective: the local-only AG Studio licence bridge reads ONLY the one licence line (the same file holds
 * provider secrets), exists only on the dev server, and answers only same-machine, same-origin, explicitly
 * flagged requests. All keys here are obvious fakes.
 */
const FAKE = "FAKE-LICENCE-FOR-TESTS-ONLY";
const dirs: string[] = [];
const envDir = (content: string) => {
  const d = mkdtempSync(join(tmpdir(), "nmi-studio-env-"));
  dirs.push(d);
  writeFileSync(join(d, ".env.local"), content);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Resp {
  status: number;
  headers: Record<string, string>;
  body: string;
}
type Handler = (req: unknown, res: unknown) => void;

function mount(flagOn: boolean, dirsArg: string[], host: string | boolean | undefined = undefined) {
  const handlers: { path: string; fn: Handler }[] = [];
  const warnings: string[] = [];
  const plugin = studioDevLicence(flagOn, dirsArg);
  const hook = plugin.configureServer as unknown as (s: unknown) => void;
  hook({
    config: { server: { host }, logger: { warn: (m: string) => warnings.push(m) } },
    middlewares: { use: (path: string, fn: Handler) => handlers.push({ path, fn }) },
  } as unknown as ViteDevServer);
  const call = (opts: {
    method?: string;
    remote?: string;
    host?: string;
    headers?: Record<string, string>;
  }): Resp => {
    const out: Resp = { status: 200, headers: {}, body: "" };
    const req = {
      method: opts.method ?? "GET",
      socket: { remoteAddress: opts.remote ?? "127.0.0.1" },
      headers: {
        host: opts.host ?? "localhost:5173",
        "x-nmi-dev-studio": "1",
        ...(opts.headers ?? {}),
      },
    };
    const res = {
      set statusCode(v: number) {
        out.status = v;
      },
      setHeader: (k: string, v: string) => (out.headers[k.toLowerCase()] = v),
      end: (b?: string) => (out.body = b ?? ""),
    };
    handlers[0]?.fn(req, res);
    return out;
  };
  return { handlers, warnings, call, plugin };
}

describe("readStudioLicenceKey", () => {
  it("returns only the licence value and ignores every other secret in the file", () => {
    const d = envDir(
      `PAYPAL_CLIENT_SECRET=do-not-read\nOPENAI_API_KEY=do-not-read\nAG_STUDIO_LICENSE_KEY=${FAKE}\nSESSION_SECRET=x\n`,
    );
    expect(readStudioLicenceKey([d])).toBe(FAKE);
  });
  it("supports quotes and export, trims, and treats empty/missing as no key", () => {
    expect(readStudioLicenceKey([envDir(`export AG_STUDIO_LICENSE_KEY="${FAKE}"\n`)])).toBe(FAKE);
    expect(readStudioLicenceKey([envDir(`AG_STUDIO_LICENSE_KEY=\n`)])).toBeNull();
    expect(readStudioLicenceKey([envDir(`OTHER=1\n`)])).toBeNull();
    expect(readStudioLicenceKey([join(tmpdir(), "does-not-exist-nmi")])).toBeNull();
  });
  it("prefers the first directory that defines the key", () => {
    expect(
      readStudioLicenceKey([
        envDir(`AG_STUDIO_LICENSE_KEY=first\n`),
        envDir(`AG_STUDIO_LICENSE_KEY=second\n`),
      ]),
    ).toBe("first");
  });
});

describe("studioDevLicence plugin", () => {
  it("exists only on the dev server (never for build or preview)", () => {
    expect(studioDevLicence(true, []).apply).toBe("serve");
    const p = studioDevLicence(true, []);
    expect(p.configurePreviewServer).toBeUndefined();
    expect(p.transform).toBeUndefined();
    expect(p.load).toBeUndefined();
    expect(p.config).toBeUndefined();
  });

  it("registers nothing when the opt-in flag is off", () => {
    expect(mount(false, [envDir(`AG_STUDIO_LICENSE_KEY=${FAKE}\n`)]).handlers).toHaveLength(0);
  });

  it("refuses to run when the dev server is not bound to loopback", () => {
    const m = mount(true, [envDir(`AG_STUDIO_LICENSE_KEY=${FAKE}\n`)], "0.0.0.0");
    expect(m.handlers).toHaveLength(0);
    expect(m.warnings.join(" ")).toContain("not bound to loopback");
    expect(m.warnings.join(" ")).not.toContain(FAKE);
    expect(mount(true, [envDir(`AG_STUDIO_LICENSE_KEY=${FAKE}\n`)], true).handlers).toHaveLength(0);
    expect(
      mount(true, [envDir(`AG_STUDIO_LICENSE_KEY=${FAKE}\n`)], "localhost").handlers,
    ).toHaveLength(1);
  });

  it("serves the key only to a loopback, same-origin, flagged GET, with no-store", () => {
    const m = mount(true, [envDir(`AG_STUDIO_LICENSE_KEY=${FAKE}\n`)]);
    expect(m.handlers[0]?.path).toBe("/__nmi_dev/studio-licence");
    const good = m.call({});
    expect(good.status).toBe(200);
    expect(JSON.parse(good.body)).toEqual({ licenseKey: FAKE });
    expect(good.headers["cache-control"]).toBe("no-store");
    expect(m.call({ remote: "::1" }).status).toBe(200);
    expect(m.call({ host: "127.0.0.1:5173" }).status).toBe(200);
    expect(m.call({ headers: { "sec-fetch-site": "same-origin" } }).status).toBe(200);
  });

  it.each([
    ["a non-loopback peer", { remote: "192.168.1.20" }],
    ["a foreign Host header (DNS rebinding)", { host: "attacker.example:5173" }],
    ["a missing custom header", { headers: { "x-nmi-dev-studio": "" } }],
    ["a cross-site fetch", { headers: { "sec-fetch-site": "cross-site" } }],
    ["a same-site (sibling) fetch", { headers: { "sec-fetch-site": "same-site" } }],
    ["a POST", { method: "POST" }],
  ])("answers %s with 403 and no key", (_n, opts) => {
    const m = mount(true, [envDir(`AG_STUDIO_LICENSE_KEY=${FAKE}\n`)]);
    const r = m.call(opts);
    expect(r.status).toBe(403);
    expect(r.body).not.toContain(FAKE);
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("answers a null key (watermarked evaluation) when none is configured", () => {
    const m = mount(true, [envDir(`OTHER=1\n`)]);
    expect(JSON.parse(m.call({}).body)).toEqual({ licenseKey: null });
  });
});
