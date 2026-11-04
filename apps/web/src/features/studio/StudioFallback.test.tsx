// @vitest-environment happy-dom
import { lazy, act, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsSummary } from "../../domain/serverAnalytics.js";
import type { StudioRange } from "./studioModel.js";
import { labScenario } from "../../../studio-lab/synthetic.js";
import StudioPanel from "./StudioPanel.js";
import { StudioSlotWith } from "./StudioSlot.js";
import { STATUS_SERIES } from "./studioReport.js";

// Licensed packages are never loaded here: the loader and the licence fetch are replaced by stubs.
const licence = vi.hoisted(() => ({
  required: false,
  key: null as string | null,
  seen: [] as unknown[],
}));
vi.mock("./studioLoader.js", () => ({
  loadStudioModule: () =>
    Promise.resolve({
      StudioRoot: ({
        children,
        licenseKey,
      }: {
        children: React.ReactNode;
        licenseKey: string | null;
      }) => {
        licence.seen.push(licenseKey);
        return <>{children}</>;
      },
      TrendChart: () => <div data-testid="fake-trend" />,
      StatusChart: () => <div data-testid="fake-status" />,
    }),
}));
vi.mock("./studioLicence.js", () => ({
  fetchStudioLicenceKey: () => Promise.resolve(licence.key),
  get studioLicenceRequired() {
    return licence.required;
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(() => {
  licence.required = false;
  licence.key = null;
  licence.seen = [];
  act(() => root?.unmount());
  host.remove();
  root = null;
});
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const mount = async (el: React.ReactNode) => {
  root = createRoot(host);
  act(() => root?.render(el));
  await flush();
  await flush();
};
const panel = () => host.querySelector("#studio-panel");

describe("MINOR-1: the OUTER StudioPanel chunk fails to load", () => {
  it("shows the accessible 'Charts unavailable' notice, no Studio badge, no charts", async () => {
    const { summary, range } = labScenario({ days: 30 });
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Broken = lazy<ComponentType<{ summary: AnalyticsSummary; range: StudioRange }>>(() =>
      Promise.reject(new Error("Failed to fetch dynamically imported module")),
    );
    await mount(<StudioSlotWith Panel={Broken} summary={summary} range={range} />);
    err.mockRestore();
    expect(panel()?.getAttribute("data-studio")).toBe("fallback");
    expect(panel()?.getAttribute("aria-labelledby")).toBe("studio-unavailable-title");
    expect(host.querySelector("#studio-unavailable-title")?.textContent).toBe("Activity analytics");
    const notice = host.querySelector("#studio-unavailable");
    expect(notice?.getAttribute("role")).toBe("status");
    expect(notice?.textContent).toContain("Charts unavailable.");
    expect(notice?.textContent).toContain("not affected");
    expect(host.textContent).not.toContain("Studio · view only");
    expect(host.querySelector("[data-testid=fake-trend],[data-testid=fake-status]")).toBeNull();
    expect(host.querySelector("button")).toBeNull(); // no Retry that could not truthfully recover
  });

  it("a healthy panel through the same slot is not replaced by the fallback", async () => {
    const { summary, range } = labScenario({ days: 30 });
    await mount(<StudioSlotWith Panel={StudioPanel} summary={summary} range={range} />);
    expect(panel()?.getAttribute("data-studio")).toBe("active");
    expect(host.querySelector("#studio-unavailable-title")).toBeNull();
  });
});

describe("MINOR-2: badge reflects whether Studio charts actually render", () => {
  it("over-limit currency: exact table + 'Chart not drawn', no badge, not 'active'; safe currency restores it", async () => {
    const { summary, range } = labScenario({ days: 30, currencies: ["USD", "EUR"], huge: true });
    await mount(<StudioPanel summary={summary} range={range} />);
    const tabs = [...host.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    expect(tabs.length).toBe(2);
    const pick = async (cur: string) => {
      const t = [...host.querySelectorAll<HTMLButtonElement>("[role=tab]")].find(
        (x) => x.textContent === cur,
      );
      act(() => t?.click());
      await flush();
    };
    await pick("USD"); // labScenario puts the huge bucket in currencies[0] = USD
    expect(host.querySelector("#studio-too-large")?.textContent).toContain("Chart not drawn");
    expect(host.querySelector("[data-testid=studio-daily-table]")).not.toBeNull();
    expect(host.querySelector("[data-testid=fake-trend]")).toBeNull();
    expect(host.querySelector(".studio-title .badge")).toBeNull();
    expect(panel()?.getAttribute("data-studio")).toBe("fallback");

    await pick("EUR");
    expect(host.querySelector("#studio-too-large")).toBeNull();
    expect(host.querySelector("[data-testid=fake-trend]")).not.toBeNull();
    expect(host.querySelector(".studio-title .badge")?.textContent).toBe("Studio · view only");
    expect(panel()?.getAttribute("data-studio")).toBe("active");

    await pick("USD");
    expect(host.querySelector(".studio-title .badge")).toBeNull();
    expect(panel()?.getAttribute("data-studio")).toBe("fallback");
  });

  it("single currency with every bucket over the limit never shows the badge", async () => {
    const { summary, range } = labScenario({ days: 30, currencies: ["USD"], huge: true });
    await mount(<StudioPanel summary={summary} range={range} />);
    expect(host.querySelector("#studio-too-large")).not.toBeNull();
    expect(host.querySelector(".studio-title .badge")).toBeNull();
    expect(panel()?.getAttribute("data-studio")).toBe("fallback");
  });
});

describe("analytics-first: chart tabs are explained as view-only", () => {
  it("under All currencies, visible text says the tabs only switch the chart and points to the filter above", async () => {
    const { summary, range } = labScenario({ days: 30 });
    await mount(<StudioPanel summary={summary} range={range} />);
    expect(host.querySelector("[role=tablist]")).not.toBeNull();
    const note = host.querySelector("#studio-tabs-note")?.textContent ?? "";
    expect(note).toContain("USD / EUR / JPY tabs only switch which currency the chart draws");
    expect(note).toContain("choose a currency in the filter above");
  });

  it("with a single currency there are no tabs and no tabs note", async () => {
    const { summary, range } = labScenario({ days: 30, currencies: ["EUR"] });
    await mount(<StudioPanel summary={summary} range={range} />);
    expect(host.querySelector("[role=tablist]")).toBeNull();
    expect(host.querySelector("#studio-tabs-note")).toBeNull();
  });
});

describe("P5 licensed production: the licence is mandatory", () => {
  it("without a licence (not configured, signed out, network) shows 'Charts unavailable' with Retry, never Studio", async () => {
    licence.required = true;
    licence.key = null;
    const { summary, range } = labScenario({ days: 30 });
    await mount(<StudioPanel summary={summary} range={range} />);
    expect(panel()?.getAttribute("data-studio")).toBe("fallback");
    expect(host.querySelector("#studio-unavailable")?.textContent).toContain("Charts unavailable.");
    expect(host.querySelector("[data-testid=fake-trend],[data-testid=fake-status]")).toBeNull();
    expect(host.textContent).not.toContain("Studio · view only");
    expect(licence.seen).toEqual([]); // StudioRoot never mounted without a licence
    // Exact figures stay available as text.
    expect(host.querySelector("[data-testid=studio-daily-table]")).not.toBeNull();
    expect(host.querySelector("[data-testid=studio-status-list]")).not.toBeNull();
    const retry = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Try loading charts again"),
    );
    expect(retry).toBeDefined();

    // The licence becomes available (e.g. the operator signed in again): Retry recovers.
    licence.key = "synthetic-licence-for-test";
    act(() => retry?.click());
    await flush();
    await flush();
    expect(panel()?.getAttribute("data-studio")).toBe("active");
    expect(licence.seen.at(-1)).toBe("synthetic-licence-for-test");
  });

  it("with the licence, Studio renders with that licence passed to the provider", async () => {
    licence.required = true;
    licence.key = "synthetic-licence-for-test";
    const { summary, range } = labScenario({ days: 30 });
    await mount(<StudioPanel summary={summary} range={range} />);
    expect(panel()?.getAttribute("data-studio")).toBe("active");
    expect(licence.seen).toContain("synthetic-licence-for-test");
  });
});

describe("P5 dashboard visuals: headline figures and the compact status table", () => {
  it("the summary strip shows the charted currency's exact total, count and active days from the aggregate", async () => {
    const { summary, range } = labScenario({ days: 30 });
    await mount(<StudioPanel summary={summary} range={range} />);
    const kpis = host.querySelector("[data-testid=studio-kpis]")?.textContent ?? "";
    const cur = host.querySelector(".cur-now")?.textContent ?? "";
    const rows = [...host.querySelectorAll("[data-testid=studio-daily-table] tbody tr")];
    const active = rows.filter((r) => r.children[1]?.textContent !== "0").length;
    expect(kpis).toContain(`Total (${cur})`);
    expect(kpis).toContain(`Days with invoices${active} of ${rows.length}`);
    const card = summary.currencies.find((c) => c.currency === cur);
    expect(kpis).toContain(`Invoices${card?.invoiceCount}`);
  });

  it("the status counts are one table, a row per currency, with legend swatches and glyphs (not colour alone)", async () => {
    const { summary, range } = labScenario({ days: 30 });
    await mount(<StudioPanel summary={summary} range={range} />);
    const table = host.querySelector("table[data-testid=studio-status-list]");
    expect(table?.querySelector("caption")?.textContent).toContain("never combined");
    const heads = [...(table?.querySelectorAll("thead th") ?? [])].map((t) => t.textContent);
    expect(heads).toEqual([
      "Currency",
      "○ No draft",
      "◔ In progress",
      "✓ Draft created",
      "! Attention",
      "Invoices",
    ]);
    expect(table?.querySelectorAll("thead .swatch")).toHaveLength(4);
    const body = [...(table?.querySelectorAll("tbody tr") ?? [])].map((r) =>
      [...r.children].map((c) => c.textContent),
    );
    expect(body).toEqual(
      summary.currencies.map((c) => [
        c.currency,
        ...STATUS_SERIES.map(({ state }) => String(c.stateCounts[state])),
        String(c.invoiceCount),
      ]),
    );
  });
});
