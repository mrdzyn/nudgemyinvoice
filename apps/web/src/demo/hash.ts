import { reducer, initialState, type AppState, type Screen, type Theme } from "./appState.js";
import { isScenarioId, type ScenarioId } from "./scenarios.js";

/**
 * The URL hash carries ONLY the screen, the demo state and the theme, e.g.
 * `#screen=review&state=validation-errors&theme=dark`. It never carries invoice content.
 */
const SCREENS: readonly Screen[] = ["login", "dashboard", "composer", "review", "detail"];

export interface ParsedHash {
  screen: Screen | null;
  scenario: ScenarioId;
  theme: Theme | null;
}

export function parseHash(hash: string): ParsedHash {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const screen = p.get("screen");
  const state = p.get("state");
  const theme = p.get("theme");
  return {
    screen: SCREENS.find((s) => s === screen) ?? null,
    scenario: state !== null && isScenarioId(state) ? state : "default",
    theme: theme === "dark" || theme === "light" ? theme : null,
  };
}

export function stateFromHash(hash: string, prefersDark: boolean): AppState {
  const parsed = parseHash(hash);
  let s = initialState(parsed.theme ?? (prefersDark ? "dark" : "light"));
  if (parsed.scenario !== "default") s = reducer(s, { type: "scenario", id: parsed.scenario });
  if (parsed.screen) s = reducer(s, { type: "navigate", screen: parsed.screen });
  return { ...s, navigated: false };
}

export function hashFor(s: AppState): string {
  const p = new URLSearchParams();
  p.set("screen", s.screen);
  if (s.scenario !== "default") p.set("state", s.scenario);
  p.set("theme", s.theme);
  return `#${p.toString()}`;
}
