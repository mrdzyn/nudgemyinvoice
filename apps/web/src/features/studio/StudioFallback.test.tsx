// @vitest-environment happy-dom
import { lazy, act, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsSummary } from "../../domain/serverAnalytics.js";
import type { StudioRange } from "./studioModel.js";
import { labScenario } from "../../../studio-lab/synthetic.js";
import StudioPanel from "./StudioPanel.js";
import { StudioSlotWith } from "./StudioSlot.js";

// Licensed packages are never loaded here: the loader and the licence fetch are replaced by stubs.
vi.mock("./studioLoader.js", () => ({
  loadStudioModule: () =>
    Promise.resolve({
      StudioRoot: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      TrendChart: () => <div data-testid="fake-trend" />,
      StatusChart: () => <div data-testid="fake-status" />,
    }),
}));
vi.mock("./studioLicence.js", () => ({ fetchDevLicenceKey: () => Promise.resolve(null) }));

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
