import { formFromDraft, type FormState } from "../domain/invoiceForm.js";
import { paypalRefusal } from "../domain/money.js";
import type { PayPalViewState, SavedInvoice } from "../domain/types.js";
import { draftOf, FIXTURE_IDS, FIXTURE_INVOICES, scenarioById } from "./fixtures.js";
import type { ScenarioId } from "./scenarios.js";

export type Screen = "login" | "dashboard" | "composer" | "review" | "detail";
export type Theme = "light" | "dark";
export type ComposerTab = "ai" | "manual";
export type DashMode = "normal" | "empty" | "loading" | "error";
export type LoginNotice = "signed-out" | "session-expired" | "login-error" | "login-throttled";
export type DetailNotice = "created" | "replayed" | null;
export type SaveMode = "normal" | "replay" | "conflict";

export type ParseState =
  | { status: "idle" }
  | { status: "loading"; clarified: boolean; scenarioId?: string }
  | { status: "clarify"; scenarioId: string; questions: { field: string; question: string }[] }
  | { status: "invalid"; errors: { path: string; message: string }[] }
  | { status: "unavailable" };

export interface ComposerState {
  text: string;
  tab: ComposerTab;
  parse: ParseState;
}

/** Seed for the review form. In-memory only: never written to storage, cookies or the URL. */
export interface ReviewSeed {
  form: FormState;
  source: "ai" | "manual";
  showErrors: boolean;
  saveMode: SaveMode;
}

export interface PayPalOverride {
  state: PayPalViewState;
  code: string | null;
}

export interface AppState {
  screen: Screen;
  authed: boolean;
  theme: Theme;
  offline: boolean;
  scenario: ScenarioId;
  invoices: SavedInvoice[];
  detailId: string | null;
  detailNotice: DetailNotice;
  dashMode: DashMode;
  loginNotice: LoginNotice | null;
  composer: ComposerState;
  review: ReviewSeed | null;
  /** Bumped whenever a screen must re-initialise from its seed. */
  seedKey: number;
  ppOverride: PayPalOverride | null;
  ppDisabled: boolean;
  /** False until the first in-app navigation, so initial page load does not steal focus. */
  navigated: boolean;
  savedCount: number;
  ppCount: number;
}

export const idleComposer = (): ComposerState => ({
  text: "",
  tab: "ai",
  parse: { status: "idle" },
});

export function initialState(theme: Theme): AppState {
  return {
    screen: "login",
    authed: false,
    theme,
    offline: false,
    scenario: "default",
    invoices: FIXTURE_INVOICES.map((i) => structuredClone(i)),
    detailId: null,
    detailNotice: null,
    dashMode: "normal",
    loginNotice: null,
    composer: idleComposer(),
    review: null,
    seedKey: 0,
    ppOverride: null,
    ppDisabled: false,
    navigated: false,
    savedCount: 0,
    ppCount: 1,
  };
}

export type Action =
  | { type: "navigate"; screen: Screen; resetComposer?: boolean }
  | { type: "open-detail"; id: string }
  | { type: "set-theme"; theme: Theme }
  | { type: "set-offline"; offline: boolean }
  | { type: "scenario"; id: ScenarioId }
  | { type: "sign-in" }
  | { type: "sign-out" }
  | { type: "composer"; patch: Partial<ComposerState> }
  | { type: "start-review"; form: FormState; source: "ai" | "manual" }
  | { type: "discard-review" }
  | { type: "save-invoice"; invoice: SavedInvoice; notice: DetailNotice }
  | { type: "paypal-created"; id: string }
  | { type: "paypal-override"; override: PayPalOverride | null };

/** Over-limit demo text: 2,143 characters, 143 over the approved 2,000 limit. */
export function overLimitText(): string {
  let t = "";
  while (t.length < 2143)
    t += "Invoice Acme Design for brand identity work, logo concepts and typography guides. ";
  return t.slice(0, 2143);
}

const OVERRIDES: Partial<
  Record<ScenarioId, { id: string; override: PayPalOverride | null; disabled?: boolean }>
> = {
  "paypal-disabled": { id: FIXTURE_IDS.eurNone, override: null, disabled: true },
  "paypal-creating": { id: FIXTURE_IDS.jpyCreating, override: null },
  "paypal-reconciling": { id: FIXTURE_IDS.eurNone, override: { state: "reconciling", code: null } },
  "paypal-unknown": {
    id: FIXTURE_IDS.eurNone,
    override: { state: "unknown", code: "created_not_visible" },
  },
  "paypal-rejected": {
    id: FIXTURE_IDS.eurNone,
    override: { state: "rejected", code: "paypal_validation_error" },
  },
  "paypal-mismatch": {
    id: FIXTURE_IDS.eurNone,
    override: { state: "mismatch", code: "payload_digest_mismatch" },
  },
  "paypal-created": { id: FIXTURE_IDS.usdCreated, override: null },
};

function withScenario(base: AppState, id: ScenarioId): AppState {
  const s: AppState = {
    ...base,
    scenario: id,
    loginNotice: null,
    dashMode: "normal",
    composer: idleComposer(),
    review: null,
    ppOverride: null,
    ppDisabled: false,
    detailNotice: null,
    offline: id === "offline",
    seedKey: base.seedKey + 1,
    navigated: true,
  };
  const seedReview = (
    form: FormState,
    source: "ai" | "manual",
    showErrors = false,
    saveMode: SaveMode = "normal",
  ) => ({
    ...s,
    screen: "review" as const,
    review: { form, source, showErrors, saveMode },
  });
  switch (id) {
    case "login-error":
    case "login-throttled":
      return { ...s, authed: false, screen: "login", loginNotice: id };
    case "session-expired":
      return { ...s, authed: false, screen: "login", loginNotice: "session-expired" };
    case "empty":
      return { ...s, authed: true, screen: "dashboard", dashMode: "empty" };
    case "loading":
      return { ...s, authed: true, screen: "dashboard", dashMode: "loading" };
    case "list-error":
      return { ...s, authed: true, screen: "dashboard", dashMode: "error" };
    case "offline":
      return {
        ...s,
        authed: s.authed || base.screen !== "login",
        screen: base.screen === "login" ? "dashboard" : base.screen,
      };
    case "over-limit":
      return {
        ...s,
        authed: true,
        screen: "composer",
        composer: { text: overLimitText(), tab: "ai", parse: { status: "idle" } },
      };
    case "ai-clarification": {
      const sc = scenarioById("eur-clarify");
      const q = sc.outcome.status === "needs_clarification" ? sc.outcome.questions : [];
      return {
        ...s,
        authed: true,
        screen: "composer",
        composer: {
          text: sc.text,
          tab: "ai",
          parse: { status: "clarify", scenarioId: sc.id, questions: q },
        },
      };
    }
    case "ai-invalid": {
      const sc = scenarioById("unparseable");
      const errors = sc.outcome.status === "invalid" ? sc.outcome.errors : [];
      return {
        ...s,
        authed: true,
        screen: "composer",
        composer: { text: sc.text, tab: "ai", parse: { status: "invalid", errors } },
      };
    }
    case "ai-unavailable":
      return {
        ...s,
        authed: true,
        screen: "composer",
        composer: {
          text: scenarioById("usd-draft").text,
          tab: "ai",
          parse: { status: "unavailable" },
        },
      };
    case "validation-errors":
      return {
        ...seedReview(
          {
            customerName: "",
            customerEmail: "billing@",
            currency: "JPY",
            dueDate: "",
            taxPercent: "120",
            discountKind: "percent",
            discountValue: "",
            lines: [{ description: "", quantity: "0", unitPrice: "85.50" }],
          },
          "manual",
          true,
        ),
        authed: true,
      };
    case "rounding":
      return {
        ...seedReview(formFromDraft(draftOf(scenarioById("eur-clarify").afterClarification)), "ai"),
        authed: true,
      };
    case "save-replay":
    case "save-conflict":
      return {
        ...seedReview(
          formFromDraft(draftOf(scenarioById("usd-draft").outcome)),
          "ai",
          false,
          id === "save-replay" ? "replay" : "conflict",
        ),
        authed: true,
      };
    case "paypal-refused": {
      const gbp = base.invoices.find((i) => i.id === FIXTURE_IDS.gbpRefused);
      const code = gbp ? paypalRefusal(gbp.draft) : null;
      return {
        ...s,
        authed: true,
        screen: "detail",
        detailId: FIXTURE_IDS.gbpRefused,
        ppOverride: { state: "refused", code },
      };
    }
    default: {
      const o = OVERRIDES[id];
      if (o)
        return {
          ...s,
          authed: true,
          screen: "detail",
          detailId: o.id,
          ppOverride: o.override,
          ppDisabled: o.disabled === true,
        };
      return s;
    }
  }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "navigate": {
      const resetComposer = action.resetComposer === true;
      return {
        ...state,
        screen: action.screen,
        authed: action.screen === "login" ? false : true,
        navigated: true,
        detailNotice: action.screen === "dashboard" ? null : state.detailNotice,
        composer: resetComposer ? idleComposer() : state.composer,
        seedKey: resetComposer ? state.seedKey + 1 : state.seedKey,
        review:
          action.screen === "review" && !state.review
            ? {
                form: formFromDraft(draftOf(scenarioById("usd-draft").outcome)),
                source: "ai",
                showErrors: false,
                saveMode: "normal",
              }
            : state.review,
      };
    }
    case "open-detail":
      return {
        ...state,
        screen: "detail",
        detailId: action.id,
        ppOverride: null,
        detailNotice: null,
        navigated: true,
        seedKey: state.seedKey + 1,
      };
    case "set-theme":
      return { ...state, theme: action.theme };
    case "set-offline":
      return { ...state, offline: action.offline || state.scenario === "offline" };
    case "scenario":
      return withScenario(state, action.id);
    case "sign-in":
      return { ...state, authed: true, screen: "dashboard", loginNotice: null, navigated: true };
    case "sign-out":
      return {
        ...state,
        authed: false,
        screen: "login",
        loginNotice: "signed-out",
        navigated: true,
        review: null,
        composer: idleComposer(),
      };
    case "composer":
      return { ...state, composer: { ...state.composer, ...action.patch } };
    case "start-review":
      return {
        ...state,
        screen: "review",
        authed: true,
        navigated: true,
        seedKey: state.seedKey + 1,
        review: {
          form: action.form,
          source: action.source,
          showErrors: false,
          saveMode: state.review?.saveMode ?? "normal",
        },
        composer: { ...state.composer, parse: { status: "idle" } },
      };
    case "discard-review":
      return { ...state, review: null, screen: "dashboard", navigated: true };
    case "save-invoice":
      return {
        ...state,
        invoices: [action.invoice, ...state.invoices],
        savedCount: state.savedCount + 1,
        detailId: action.invoice.id,
        detailNotice: action.notice,
        ppOverride: null,
        review: null,
        screen: "detail",
        navigated: true,
        seedKey: state.seedKey + 1,
      };
    case "paypal-created": {
      const n = state.ppCount + 1;
      const paypalId = `INV2-DEMO-FAKE-0000-${String(n).padStart(4, "0")}`;
      return {
        ...state,
        ppCount: n,
        ppOverride: null,
        invoices: state.invoices.map((i) =>
          i.id === action.id
            ? {
                ...i,
                paypalInvoiceId: paypalId,
                paypal: { state: "created", paypalInvoiceId: paypalId, lastErrorCode: null },
              }
            : i,
        ),
      };
    }
    case "paypal-override":
      return { ...state, ppOverride: action.override };
  }
}
