import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { Presence } from './Presence';
import type { PresenceBinding } from './use-presence';

interface DialogProps {
  title: string;
  /** Closing plays the exit before the dialog leaves; omit it when the owner unmounts the dialog. */
  open?: boolean;
  /** For an owner that runs the presence itself, so its own state leaves with the dialog. */
  presence?: PresenceBinding;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  /** Where the focus lands on opening; the browser would pick the close button. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Escape goes here first: return true when it undid something and the dialog must stay. */
  onEscape?(): boolean;
  onClose(): void;
}

export function Dialog({ open = true, presence, ...props }: DialogProps) {
  if (presence) return <DialogSurface {...props} presence={presence} />;
  return (
    <Presence open={open}>{(binding) => <DialogSurface {...props} presence={binding} />}</Presence>
  );
}

type SurfaceProps = Omit<DialogProps, 'open' | 'presence'> & { presence: PresenceBinding };

function DialogSurface({
  title,
  presence,
  children,
  footer,
  busy = false,
  initialFocus,
  onEscape,
  onClose,
}: SurfaceProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { ref: presenceRef } = presence;
  const attach = useCallback(
    (node: HTMLDialogElement | null) => {
      ref.current = node;
      presenceRef(node);
    },
    [presenceRef],
  );
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
      ref={attach}
      className="dialog"
      data-state={presence.state}
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
