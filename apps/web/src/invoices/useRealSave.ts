import { useEffect, useMemo, useRef, useState } from "react";
import type { InvoiceDraft } from "../domain/types.js";
import type { ServerInvoice } from "../domain/serverInvoice.js";
import type { SaveResult } from "./api.js";
import { createKeyLedger } from "./keyLedger.js";
import { createSaveRunner } from "./saveRunner.js";

export type SaveUi =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "conflict" }
  | { status: "failed"; reason: "rejected" | "invalid-draft" | "forbidden"; messages: string[] }
  /** The server may or may not have committed. The form is locked until the operator decides. */
  | { status: "uncertain"; cause: "network" | "server" | "malformed" | "timeout" };

type SaveFn = (draft: InvoiceDraft, key: string, signal: AbortSignal) => Promise<SaveResult>;

/**
 * When a submit may start. Never while one is pending, never over an unresolved 409 (the operator
 * must ask for a new key), and an uncertain attempt may only be retried with the identical body.
 */
export function mayStartSave(ui: SaveUi, pending: boolean, bodyMatchesKey: boolean): boolean {
  if (pending || ui.status === "conflict") return false;
  if (ui.status === "uncertain" && !bodyMatchesKey) return false;
  return true;
}

/** Orchestrates one real save: single flight, key lifecycle, abort on unmount, stale-result drop. */
export function useRealSave(opts: {
  save: SaveFn;
  onSaved: (invoice: ServerInvoice, replayed: boolean) => void;
  onExpired: () => void;
}) {
  const [ui, setUi] = useState<SaveUi>({ status: "idle" });
  const ledger = useMemo(() => createKeyLedger(), []);
  const handler = useRef<(r: SaveResult) => void>(() => undefined);
  const runner = useMemo(() => createSaveRunner(opts.save, (r) => handler.current(r)), [opts.save]);

  handler.current = (r) => {
    switch (r.kind) {
      case "saved":
        opts.onSaved(r.invoice, r.replayed);
        return;
      case "unauthorized":
        opts.onExpired();
        return;
      case "conflict":
        setUi({ status: "conflict" });
        return;
      case "uncertain":
        setUi({ status: "uncertain", cause: r.cause });
        return;
      case "aborted":
        setUi({ status: "idle" });
        return;
      case "rejected":
        setUi({ status: "failed", reason: "rejected", messages: r.messages });
        return;
      case "invalid-draft":
        setUi({
          status: "failed",
          reason: "invalid-draft",
          messages: r.message ? [r.message] : [],
        });
        return;
      case "forbidden":
        setUi({ status: "failed", reason: "forbidden", messages: [] });
        return;
    }
  };

  useEffect(() => () => void runner.abort(), [runner]);

  return {
    ui,
    /** Sends `draft` once; ignored while a save is pending or while a conflict/uncertain outcome awaits a decision. */
    submit(draft: InvoiceDraft, bodyKey: string) {
      if (!mayStartSave(ui, runner.pending, ledger.matches(bodyKey))) return false;
      const key = ledger.keyFor(bodyKey);
      if (!runner.start(draft, key)) return false;
      setUi({ status: "saving" });
      return true;
    },
    /** Explicit: after a confirmed 409 the operator asks for a fresh key and keeps their edits. */
    useNewKey() {
      ledger.reset();
      setUi({ status: "idle" });
    },
    /** Explicit: the operator accepts that the earlier uncertain attempt may exist and saves edited details as a new draft. */
    abandonUncertain() {
      ledger.reset();
      setUi({ status: "idle" });
    },
  };
}
