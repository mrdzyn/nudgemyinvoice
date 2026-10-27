/** Demo states reviewers can jump to. They only exist to make every approved state visible. */
export type ScenarioId =
  | "default"
  | "login-error"
  | "login-throttled"
  | "session-expired"
  | "empty"
  | "loading"
  | "list-error"
  | "offline"
  | "over-limit"
  | "ai-clarification"
  | "ai-invalid"
  | "ai-unavailable"
  | "validation-errors"
  | "rounding"
  | "save-replay"
  | "save-conflict"
  | "paypal-disabled"
  | "paypal-refused"
  | "paypal-creating"
  | "paypal-reconciling"
  | "paypal-unknown"
  | "paypal-rejected"
  | "paypal-mismatch"
  | "paypal-created";

export interface ScenarioGroup {
  label: string | null;
  items: { id: ScenarioId; label: string }[];
}

export const SCENARIO_GROUPS: readonly ScenarioGroup[] = [
  { label: null, items: [{ id: "default", label: "Default / working flow" }] },
  {
    label: "Login",
    items: [
      { id: "login-error", label: "Login failed (401)" },
      { id: "login-throttled", label: "Too many attempts (429)" },
      { id: "session-expired", label: "Session expired" },
    ],
  },
  {
    label: "Dashboard",
    items: [
      { id: "empty", label: "Empty" },
      { id: "loading", label: "Loading" },
      { id: "list-error", label: "List request failed" },
      { id: "offline", label: "Offline" },
    ],
  },
  {
    label: "Composer",
    items: [
      { id: "over-limit", label: "Over 2,000-character limit" },
      { id: "ai-clarification", label: "AI needs clarification" },
      { id: "ai-invalid", label: "AI could not read the text" },
      { id: "ai-unavailable", label: "AI unavailable" },
    ],
  },
  {
    label: "Review and save",
    items: [
      { id: "validation-errors", label: "Validation errors" },
      { id: "rounding", label: "Rounding in totals" },
      { id: "save-replay", label: "Duplicate save (replayed)" },
      { id: "save-conflict", label: "Idempotency conflict (409)" },
    ],
  },
  {
    label: "PayPal Sandbox draft",
    items: [
      { id: "paypal-disabled", label: "Disabled (503)" },
      { id: "paypal-refused", label: "Refused, rounding or tax rule (422)" },
      { id: "paypal-creating", label: "In progress (409)" },
      { id: "paypal-reconciling", label: "Reconciling (409)" },
      { id: "paypal-unknown", label: "Outcome unknown (502)" },
      { id: "paypal-rejected", label: "Rejected (502)" },
      { id: "paypal-mismatch", label: "Remote mismatch (502)" },
      { id: "paypal-created", label: "Created" },
    ],
  },
];

export const ALL_SCENARIOS: readonly ScenarioId[] = SCENARIO_GROUPS.flatMap((g) =>
  g.items.map((i) => i.id),
);

export const isScenarioId = (v: string): v is ScenarioId =>
  (ALL_SCENARIOS as readonly string[]).includes(v);
