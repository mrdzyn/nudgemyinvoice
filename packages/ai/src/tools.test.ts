import { describe, expect, it, vi } from "vitest";
import { PRIVILEGED_ACTIONS } from "@nmi/domain";
import {
  AGENT_TOOL_ALLOWLIST,
  dispatchAgentTool,
  ToolNotAllowedError,
  type ToolHandlers,
} from "./tools.js";

const handlers = Object.fromEntries(
  AGENT_TOOL_ALLOWLIST.map((t) => [t, vi.fn(async () => "ok")]),
) as unknown as ToolHandlers;

describe("agent tool allowlist", () => {
  it("never includes a privileged action", () => {
    for (const a of PRIVILEGED_ACTIONS)
      expect(AGENT_TOOL_ALLOWLIST as readonly string[]).not.toContain(a);
  });
  it("dispatches allowed tools", async () => {
    await expect(dispatchAgentTool("getInvoice", {}, handlers)).resolves.toBe("ok");
  });
  it.each([...PRIVILEGED_ACTIONS, "unknownTool", "__proto__", "constructor"])(
    "refuses %s",
    async (name) => {
      await expect(dispatchAgentTool(name, {}, handlers)).rejects.toBeInstanceOf(
        ToolNotAllowedError,
      );
    },
  );
});
