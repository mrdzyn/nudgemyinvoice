import type { Screen } from "./demo/appState.js";
import { ComposerScreen } from "./features/composer/ComposerScreen.js";
import { DashboardScreen } from "./features/dashboard/DashboardScreen.js";
import { DetailScreen } from "./features/detail/DetailScreen.js";
import { ReviewScreen } from "./features/review/ReviewScreen.js";

export const TITLES: Record<Screen, string> = {
  login: "Operator sign in",
  dashboard: "Invoice drafts",
  composer: "New invoice",
  review: "Review invoice",
  detail: "Invoice draft",
};

/** Protected screens only. The sign-in screens live with their owners (real: RealApp, preview: App). */
export function CurrentScreen({ screen }: { screen: Exclude<Screen, "login"> }) {
  switch (screen) {
    case "dashboard":
      return <DashboardScreen />;
    case "composer":
      return <ComposerScreen />;
    case "review":
      return <ReviewScreen />;
    case "detail":
      return <DetailScreen />;
  }
}

export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#main-content"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById("main-content")?.focus();
      }}
    >
      Skip to main content
    </a>
  );
}
