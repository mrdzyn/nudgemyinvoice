import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles/tokens.css";
import "../src/styles/app.css";
import { StudioSlot, studioEnabled } from "../src/features/studio/StudioSlot.js";
import { labScenario } from "./synthetic.js";

// Development lab: #days=30|90|120|366 &tz=... &cur=USD,EUR &theme=dark &huge=1 &mismatch=1. Synthetic only.
const h = Object.fromEntries(
  location.hash
    .replace(/^#/, "")
    .split("&")
    .filter(Boolean)
    .map((p) => p.split("=") as [string, string]),
);
if (h["theme"] === "dark") document.documentElement.setAttribute("data-theme", "dark");
const scenario = labScenario({
  days: Number(h["days"] ?? 30),
  ...(h["end"] ? { end: h["end"] } : {}),
  ...(h["tz"] ? { timeZone: decodeURIComponent(h["tz"]) } : {}),
  ...(h["cur"] ? { currencies: h["cur"].split(",") as never } : {}),
  huge: h["huge"] === "1",
  mismatch: h["mismatch"] === "1",
});

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <main id="main-content" style={{ padding: "16px", maxWidth: 1180, margin: "0 auto" }}>
      <h1 className="screen-title">Studio lab (synthetic)</h1>
      <p className="hint" id="lab-flag">
        Studio flag: {studioEnabled ? "ON" : "OFF"}
      </p>
      <StudioSlot summary={scenario.summary} range={scenario.range} />
    </main>
  </StrictMode>,
);
