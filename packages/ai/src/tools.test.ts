import { describe, expect, it, vi } from "vitest";
import { PRIVILEGED_ACTIONS } from "@nmi/domain";
import {
  AGENT_TOOL_ALLOWLIST,
  dispatchAgentTool,
  ToolNotAllowedError,
  type ToolHandlers,
} from "./tools.js";

function makeHandlers() {
  const spies = Object.fromEntries(
    AGENT_TOOL_ALLOWLIST.map((t) => [t, vi.fn(async () => `ran:${t}`)]),
  );
  return { spies, handlers: spies as unknown as ToolHandlers };
}

describe("agent tool dispatch", () => {
  it("runs an allowed tool exactly once with its arguments", async () => {
    const { spies, handlers } = makeHandlers();
    await expect(dispatchAgentTool("getInvoice", { id: 1 }, handlers)).resolves.toBe(
      "ran:getInvoice",
    );
    expect(spies["getInvoice"]).toHaveBeenCalledOnce();
    expect(spies["getInvoice"]).toHaveBeenCalledWith({ id: 1 });
  });

  it.each([
    ...PRIVILEGED_ACTIONS,
    "unknownTool",
    "",
    "GETINVOICE",
    " getInvoice",
    "getInvoice ",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "prototype",
  ])("rejects %j and invokes no handler", async (name) => {
    const { spies, handlers } = makeHandlers();
    await expect(dispatchAgentTool(name, {}, handlers)).rejects.toBeInstanceOf(ToolNotAllowedError);
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it("rejects even if a caller wires a handler under a privileged name", async () => {
    const { handlers } = makeHandlers();
    const send = vi.fn(async () => "sent");
    const tampered = { ...handlers, sendInvoice: send } as unknown as ToolHandlers;
    await expect(dispatchAgentTool("sendInvoice", {}, tampered)).rejects.toBeInstanceOf(
      ToolNotAllowedError,
    );
    expect(send).not.toHaveBeenCalled();
  });
});
