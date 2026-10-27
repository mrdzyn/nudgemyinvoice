import { useState, type KeyboardEvent } from "react";
import { Notice } from "../../components/Notice.js";
import { useFocusOnMount, useScheduler } from "../../components/hooks.js";
import { useApp } from "../../demo/AppContext.js";
import { PARSE_SCENARIOS, scenarioById } from "../../demo/fixtures.js";
import { blankForm, formFromDraft, MAX_PARSE_CHARS } from "../../domain/invoiceForm.js";
import type { ParseOutcome } from "../../domain/types.js";
import type { ComposerTab } from "../../demo/appState.js";

const fmt = (n: number) => n.toLocaleString("en-US");

export function ComposerScreen() {
  const { state, dispatch, announce } = useApp();
  const schedule = useScheduler();
  const headingRef = useFocusOnMount<HTMLHeadingElement>(state.navigated);
  const { text, tab, parse } = state.composer;
  const [emptyError, setEmptyError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [clarError, setClarError] = useState<string | null>(null);

  const length = text.trim().length;
  const over = length > MAX_PARSE_CHARS;
  const loading = parse.status === "loading";
  const error = over
    ? `The description is ${fmt(length - MAX_PARSE_CHARS)} characters over the 2,000-character limit. Shorten it to continue.`
    : emptyError;
  const setTab = (t: ComposerTab) => dispatch({ type: "composer", patch: { tab: t } });
  const patch = (p: Partial<typeof state.composer>) => dispatch({ type: "composer", patch: p });

  const run = (clarified: boolean, textNow: string, scenarioId?: string) => {
    if (loading) return;
    if (state.offline) {
      setEmptyError("You are offline. Parsing needs a connection.");
      return;
    }
    const t = textNow.trim();
    if (!t) {
      setEmptyError("Enter a description of the invoice before parsing.");
      document.getElementById("comp-text")?.focus();
      return;
    }
    if (t.length > MAX_PARSE_CHARS) {
      document.getElementById("comp-text")?.focus();
      return;
    }
    setEmptyError(null);
    patch({
      parse:
        scenarioId === undefined
          ? { status: "loading", clarified }
          : { status: "loading", clarified, scenarioId },
    });
    announce("Analyzing invoice text");
    schedule(() => {
      let outcome: ParseOutcome;
      let matched: string | undefined;
      if (state.scenario === "ai-unavailable") {
        outcome = { status: "unavailable", fallback: "manual_entry", reason: "ai_not_configured" };
      } else if (clarified && scenarioId) {
        const after = scenarioById(scenarioId).afterClarification;
        outcome = after ?? {
          status: "invalid",
          errors: [
            {
              path: "lineItems",
              message: "No billable line items could be identified in the text.",
            },
          ],
        };
      } else {
        const sc = PARSE_SCENARIOS.find((s) => s.text === t);
        matched = sc?.id;
        outcome = sc
          ? sc.outcome
          : {
              status: "invalid",
              errors: [
                {
                  path: "lineItems",
                  message: "No billable line items could be identified in the text.",
                },
              ],
            };
      }
      if (outcome.status === "draft") {
        dispatch({ type: "start-review", form: formFromDraft(outcome.draft), source: "ai" });
        announce("Proposal ready for review");
      } else if (outcome.status === "needs_clarification") {
        setAnswers(outcome.questions.map(() => ""));
        setClarError(null);
        patch({
          parse: {
            status: "clarify",
            scenarioId: matched ?? scenarioId ?? "",
            questions: outcome.questions,
          },
        });
        announce("The AI needs more information");
      } else if (outcome.status === "invalid") {
        patch({ parse: { status: "invalid", errors: outcome.errors } });
        announce("The AI could not read the text");
      } else {
        patch({ parse: { status: "unavailable" } });
        announce("AI parsing is unavailable");
      }
    }, 900);
  };

  const submitClarification = () => {
    if (parse.status !== "clarify") return;
    const blank = answers.findIndex((a) => !a.trim());
    if (blank >= 0) {
      setClarError("Answer every question, or edit the text above yourself.");
      document.getElementById(`clar-${blank}`)?.focus();
      return;
    }
    const add = `\n${parse.questions.map((q, i) => `${q.question} ${answers[i]?.trim() ?? ""}`).join("\n")}`;
    const next = text.trim() + add;
    if (next.length > MAX_PARSE_CHARS) {
      setClarError(
        "Adding the answers would exceed the 2,000-character limit. Shorten the text first.",
      );
      return;
    }
    patch({ text: next });
    run(true, next, parse.scenarioId);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next: ComposerTab =
      e.key === "Home" ? "ai" : e.key === "End" ? "manual" : tab === "ai" ? "manual" : "ai";
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <section aria-labelledby="comp-title">
      <div className="composer">
        <div className="page-head">
          <div>
            <h1 className="screen-title" id="comp-title" tabIndex={-1} ref={headingRef}>
              New invoice
            </h1>
            <p className="subtitle">
              Describe the work in plain language, or enter the invoice by hand
            </p>
          </div>
        </div>
        <div className="card">
          <div className="tablist" role="tablist" aria-label="How to start">
            {(
              [
                ["ai", "Describe it (AI)"],
                ["manual", "Enter manually"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                className="tab"
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={onTabKey}
              >
                {label}
              </button>
            ))}
          </div>

          <div id="panel-ai" role="tabpanel" aria-labelledby="tab-ai" hidden={tab !== "ai"}>
            {parse.status === "unavailable" ? (
              <Notice kind="warn" role="alert">
                <strong>AI parsing is unavailable.</strong> It is not configured on the server, or
                the provider could not be reached. Nothing was sent. You can enter the invoice
                manually.
                <div className="mt-12">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      dispatch({ type: "start-review", form: blankForm(), source: "manual" })
                    }
                  >
                    Continue with manual entry
                  </button>
                </div>
              </Notice>
            ) : null}
            {parse.status === "invalid" ? (
              <Notice kind="warn" role="alert">
                <strong>The AI could not turn this text into an invoice.</strong>
                <ul>
                  {parse.errors.map((e) => (
                    <li key={e.message}>{e.message}</li>
                  ))}
                </ul>
                Edit the text and try again, or{" "}
                <button
                  type="button"
                  className="btn-link"
                  onClick={() =>
                    dispatch({ type: "start-review", form: blankForm(), source: "manual" })
                  }
                >
                  enter the invoice manually
                </button>
                .
              </Notice>
            ) : null}
            <div className="field">
              <label className="spread" htmlFor="comp-text">
                <span>
                  Invoice description{" "}
                  <span className="req" aria-hidden="true">
                    *
                  </span>
                </span>
                <span className={`counter${over ? " over" : ""}`}>
                  {over
                    ? `${fmt(length)} / 2,000 · ${fmt(length - MAX_PARSE_CHARS)} over the limit`
                    : `${fmt(length)} / 2,000`}
                </span>
              </label>
              <textarea
                className="textarea"
                id="comp-text"
                rows={6}
                value={text}
                disabled={loading}
                aria-busy={loading}
                aria-invalid={error ? true : undefined}
                aria-describedby="comp-hint comp-error"
                placeholder="Example: Invoice Acme Design for 2 logo concepts at 250 USD each, 8% tax, due December 15."
                onChange={(e) => {
                  setEmptyError(null);
                  patch({ text: e.target.value });
                }}
              />
              <p className="hint" id="comp-hint">
                Up to 2,000 characters. Include the customer&apos;s name and email, currency,
                amounts and due date.
              </p>
              <p className="field-error" id="comp-error" role="alert" hidden={!error}>
                {error}
              </p>
            </div>
            <Notice kind="info" role="note" icon="🔒" id="privacy-note">
              <strong>Privacy.</strong> When AI parsing is configured on the server, the text you
              enter, including any customer names and email addresses, may be sent to OpenAI to be
              parsed. Do not paste card numbers, passwords or other secrets. The result is a
              proposal: review every field before saving.{" "}
              <span className="hint">Design note: real provider parsing is NOT TESTED.</span>
            </Notice>
            {parse.status === "clarify" ? (
              <Notice kind="ai" role="region" id="clar-box">
                <strong id="clar-title">The AI needs a little more information</strong>
                <p className="mt-4">
                  Answer each question. Your answers are added to the text and the request is parsed
                  again.
                </p>
                {parse.questions.map((q, i) => (
                  <div className="field mt-12 mb-0" key={q.question}>
                    <label htmlFor={`clar-${i}`}>
                      {i + 1}. {q.question}
                    </label>
                    <input
                      className="input"
                      id={`clar-${i}`}
                      type="text"
                      autoComplete="off"
                      value={answers[i] ?? ""}
                      aria-invalid={clarError && !(answers[i] ?? "").trim() ? true : undefined}
                      aria-describedby="clar-err"
                      onChange={(e) =>
                        setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))
                      }
                    />
                  </div>
                ))}
                <p className="field-error" id="clar-err" role="alert" hidden={!clarError}>
                  {clarError}
                </p>
                <div className="mt-12">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={submitClarification}
                  >
                    Add answers and parse again
                  </button>
                </div>
              </Notice>
            ) : null}
            <div>
              <p className="label-strong" id="chips-label">
                Synthetic example prompts
              </p>
              <div className="chip-list" role="group" aria-labelledby="chips-label">
                {PARSE_SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setEmptyError(null);
                      patch({ text: s.text, parse: { status: "idle" } });
                      document.getElementById("comp-text")?.focus();
                      announce("Example prompt loaded");
                    }}
                  >
                    <strong>{s.label}:</strong> {s.text}
                  </button>
                ))}
              </div>
              <p className="hint mt-8">
                In this preview only these four examples are recognized. Any other text returns the
                &quot;could not read&quot; outcome so that state can be reviewed.
              </p>
            </div>
            <div className="actions">
              <span className="spacer">
                Simulated: <code>POST /api/invoice-drafts/parse</code> is not called
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => dispatch({ type: "navigate", screen: "dashboard" })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                id="parse-btn"
                aria-disabled={loading || over || state.offline ? true : undefined}
                onClick={() => run(false, text)}
              >
                {loading ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Analyzing invoice text…
                  </>
                ) : (
                  "Parse with AI"
                )}
              </button>
            </div>
          </div>

          <div
            id="panel-manual"
            role="tabpanel"
            aria-labelledby="tab-manual"
            hidden={tab !== "manual"}
          >
            <p className="mb-12">
              Fill in the customer, currency, due date and line items yourself. Nothing is sent to
              an AI service.
            </p>
            <div className="actions actions-plain">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  dispatch({ type: "start-review", form: blankForm(), source: "manual" })
                }
              >
                Open blank invoice form
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
