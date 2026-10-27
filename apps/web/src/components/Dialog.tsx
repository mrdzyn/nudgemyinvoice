import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Modal confirmation built on the native <dialog>: the page behind is inert, initial focus is on
 * Cancel, Tab is wrapped inside, Escape cancels and focus returns to the opener.
 */
export function Dialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      opener.current = document.activeElement;
      dlg.showModal();
      cancelRef.current?.focus();
    } else if (!open && dlg.open) {
      dlg.close();
      if (opener.current instanceof HTMLElement && opener.current.isConnected)
        opener.current.focus();
    }
  }, [open]);

  const trap = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab") return;
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={trap}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <div id={bodyId}>{children}</div>
      <div className="actions">
        <button type="button" className="btn btn-secondary" ref={cancelRef} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
