import { useState } from "react";
import { useApp } from "./AppContext.js";
import type { Screen } from "./appState.js";
import { SCENARIO_GROUPS, isScenarioId } from "./scenarios.js";

const SCREEN_BUTTONS: { screen: Screen; label: string }[] = [
  { screen: "login", label: "1 Login" },
  { screen: "dashboard", label: "2 Dashboard" },
  { screen: "composer", label: "3 Composer" },
  { screen: "review", label: "4 Review" },
  { screen: "detail", label: "5 Detail" },
];

/** Design-review controls: jump to any screen or demo state. Not part of the product UI. */
export function DemoControls() {
  const { state, dispatch } = useApp();
  // Collapsed by default on narrow screens so the product UI stays visible.
  const [open, setOpen] = useState(
    () => typeof matchMedia === "undefined" || !matchMedia("(max-width: 767px)").matches,
  );
  return (
    <details
      className="review-controls"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Design review controls (not part of the product UI)</summary>
      <div className="review-controls-body">
        <div className="rc-group" role="group" aria-label="Screen">
          <span className="rc-label">Screen</span>
          {SCREEN_BUTTONS.map((b) => (
            <button
              key={b.screen}
              type="button"
              className="rc-btn"
              aria-current={state.screen === b.screen ? "true" : undefined}
              onClick={() => dispatch({ type: "navigate", screen: b.screen })}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="rc-group">
          <label className="rc-label" htmlFor="state-select">
            State
          </label>
          <select
            id="state-select"
            className="rc-select"
            value={state.scenario}
            onChange={(e) => {
              const v = e.target.value;
              if (isScenarioId(v)) dispatch({ type: "scenario", id: v });
            }}
          >
            {SCENARIO_GROUPS.map((g) =>
              g.label === null ? (
                g.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))
              ) : (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        </div>
        <div className="rc-group">
          <button
            type="button"
            className="rc-btn"
            aria-pressed={state.theme === "dark"}
            onClick={() =>
              dispatch({ type: "set-theme", theme: state.theme === "dark" ? "light" : "dark" })
            }
          >
            Dark theme
          </button>
        </div>
        <p className="rc-note">
          Synthetic fixtures only. This shell makes no network, PayPal or OpenAI call, and stores
          nothing in the browser. Credentials typed here are never sent anywhere.
        </p>
      </div>
    </details>
  );
}
