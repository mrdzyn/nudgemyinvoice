import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { labScenario } from "../../../studio-lab/synthetic.js";
import { StudioSlot, studioLocalEnabled } from "./StudioSlot.js";

describe("StudioSlot (default OFF)", () => {
  it("is disabled and renders nothing unless VITE_NMI_STUDIO_LOCAL=1 on the dev server", () => {
    expect(import.meta.env["VITE_NMI_STUDIO_LOCAL"]).not.toBe("1");
    expect(studioLocalEnabled).toBe(false);
    const { summary, range } = labScenario({ days: 30 });
    expect(renderToString(<StudioSlot summary={summary} range={range} />)).toBe("");
  });
});
