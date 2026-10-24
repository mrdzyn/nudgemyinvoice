import { useEffect, useState } from "react";

interface Health {
  status: string;
  paypalEnvironment: string;
  aiConfigured: boolean;
}

/** Foundation placeholder only. Business screens wait for owner design approval (see design/nmi-p1/). */
export function App() {
  const [health, setHealth] = useState<Health | "error" | null>(null);
  useEffect(() => {
    fetch("/health")
      .then((r) => (r.ok ? (r.json() as Promise<Health>) : Promise.reject(new Error("bad status"))))
      .then(setHealth)
      .catch(() => setHealth("error"));
  }, []);
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        margin: "3rem auto",
        padding: "0 1rem",
      }}
    >
      <h1>NudgeMyInvoice</h1>
      <p>Foundation build. PayPal sandbox only. Screens await design approval.</p>
      <p role="status">
        API:{" "}
        {health === null
          ? "checking…"
          : health === "error"
            ? "unreachable"
            : `${health.status} (${health.paypalEnvironment})`}
      </p>
    </main>
  );
}
