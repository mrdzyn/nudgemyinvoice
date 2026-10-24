import { isPrivilegedAction } from "@nmi/domain";

/**
 * Tools the agent may invoke. Read/draft only. Privileged actions are intentionally absent and
 * can only be executed by backend approval code (see @nmi/domain requireApproval).
 */
export const AGENT_TOOL_ALLOWLIST = [
  "getInvoice",
  "listInvoices",
  "listOverdueInvoices",
  "getPaymentStatus",
  "prepareDraftInvoice",
  "draftReminderText",
  "recommendAction",
] as const;
export type AgentToolName = (typeof AGENT_TOOL_ALLOWLIST)[number];

export class ToolNotAllowedError extends Error {
  constructor(public readonly tool: string) {
    super(`Tool "${tool}" is not on the agent allowlist`);
    this.name = "ToolNotAllowedError";
  }
}

export type ToolHandlers = Record<AgentToolName, (args: unknown) => Promise<unknown>>;

/** Single dispatch point for model-requested tool calls. Unknown or privileged names are refused. */
export async function dispatchAgentTool(
  name: string,
  args: unknown,
  handlers: ToolHandlers,
): Promise<unknown> {
  const allowed = (AGENT_TOOL_ALLOWLIST as readonly string[]).includes(name);
  if (!allowed || isPrivilegedAction(name)) throw new ToolNotAllowedError(name);
  return handlers[name as AgentToolName](args);
}
