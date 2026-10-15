import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface DialogProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  /** Where the focus lands on opening; the browser would pick the close button. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Escape goes here first: return true when it undid something and the dialog must stay. */
  onEscape?(): boolean;
  onClose(): void;
}

export function Dialog({
  title,
  children,
  footer,
  busy = false,
  initialFocus,
  onEscape,
  onClose,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressTarget = useRef<EventTarget | null>(null);
  // Read during the first render, before autoFocus moves the focus into the dialog.
  const [opener] = useState(() => document.activeElement);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    initialFocus?.current?.focus();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener, initialFocus]);
  const close = () => {
    if (!busy) onClose();
  };
  // A second Escape arrives uncancelable and closes the element natively. An open dialog
  // here is a stale event, such as the one queued by the effect cleanup in development.
  const handleNativeClose = () => {
    const dialog = ref.current;
    if (dialog?.open) return;
    if (busy) {
      dialog?.showModal();
      return;
    }
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (onEscape?.()) return;
        close();
      }}
      onClose={handleNativeClose}
      onPointerDown={(event) => {
        pressTarget.current = event.target;
      }}
      onClick={(event) => {
        // The padding lives on .dialog-inner, so only the backdrop targets the dialog itself.
        // Press and release must both land there: a drag out of a field must not close it.
        const pressed = pressTarget.current;
        pressTarget.current = null;
        const onBackdrop = event.target === event.currentTarget && pressed === event.currentTarget;
        if (onBackdrop && event.detail <= 1) close();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-heading">
          <h2>{title}</h2>
          <Button variant="ghost" onClick={close} disabled={busy} aria-label="Fermer">
            <X size={18} />
          </Button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
