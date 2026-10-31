import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import type { Action, AppState } from "./appState.js";
import type { SaveGuard } from "../invoices/leaveGuard.js";
import type {
  GetResult,
  ListQuery,
  ListResult,
  PayPalDraftResult,
  SaveResult,
} from "../invoices/api.js";
import type { InvoiceDraft } from "../domain/types.js";
import type { ParseResult } from "../parse/api.js";
import type { FollowUpsController } from "../followups/controller.js";

/** Present only in real (server-authenticated) mode. */
export interface SessionInfo {
  username: string;
  signOut: () => void;
  /**
   * Real server parse (`POST /api/invoice-drafts/parse`), bound to this session's CSRF token in
   * memory. Absent in the synthetic preview, which never reaches the network.
   */
  parse?: (description: string, signal: AbortSignal) => Promise<ParseResult>;
  /** Real save (`POST /api/invoice-drafts`), bound to this session's CSRF token in memory. */
  save?: (draft: InvoiceDraft, idempotencyKey: string, signal: AbortSignal) => Promise<SaveResult>;
  /** Real read-only, owner-scoped list (`GET /api/invoice-drafts`). Present only in real mode. */
  listInvoices?: (query: ListQuery, signal: AbortSignal) => Promise<ListResult>;
  /** Real PayPal Sandbox DRAFT creation (`POST /api/invoice-drafts/:id/paypal-draft`), CSRF bound in memory. Real mode only. */
  createPayPalDraft?: (id: string, signal: AbortSignal) => Promise<PayPalDraftResult>;
  /** Real read-only detail (`GET /api/invoice-drafts/:id`). */
  getInvoice?: (id: string, signal: AbortSignal) => Promise<GetResult>;
  /** Local follow-up reminders (NMI-FUP-01), CSRF bound in memory. Real mode only. */
  followUps?: FollowUpsController;
  /** Review reports whether a save is unresolved so leaving the screen can ask first. */
  setSaveGuard?: (guard: SaveGuard) => void;
  /** The server said 401: end the whole session (and discard every in-memory draft). */
  sessionExpired?: () => void;
}

interface AppContextValue {
  state: AppState;
  session: SessionInfo | null;
  dispatch: Dispatch<Action>;
  /** Politely announce a status change to assistive technology. */
  announce: (message: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  state,
  dispatch,
  session = null,
  children,
}: {
  state: AppState;
  dispatch: Dispatch<Action>;
  session?: SessionInfo | null;
  children: ReactNode;
}) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useCallback((m: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage("");
    timer.current = setTimeout(() => setMessage(m), 30);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <AppContext.Provider value={{ state, session, dispatch, announce }}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" data-testid="live-region">
        {message}
      </div>
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
