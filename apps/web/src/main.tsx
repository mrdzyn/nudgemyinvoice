import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/app.css";
import { RealApp } from "./RealApp.js";

// The synthetic design-review preview exists only in the dev server and only behind an explicit
// opt-in. `import.meta.env.DEV` is a build-time constant, so production bundles contain neither the
// preview nor its simulated sign-in. It is never a fallback for the real sign-in.
const SyntheticPreview = import.meta.env.DEV
  ? lazy(() => import("./App.js").then((m) => ({ default: m.App })))
  : null;
const usePreview = import.meta.env.DEV && import.meta.env["VITE_NMI_SYNTHETIC_PREVIEW"] === "1";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    {usePreview && SyntheticPreview ? (
      <Suspense fallback={null}>
        <SyntheticPreview />
      </Suspense>
    ) : (
      <RealApp />
    )}
  </StrictMode>,
);
