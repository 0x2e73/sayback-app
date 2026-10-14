import { useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Notice } from './Notice';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  /** Resolves true on success. The caller closes the dialog; false or a rejection shows a failure. */
  onConfirm(): boolean | Promise<boolean>;
  onClose(): void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, children, confirmLabel, busy = false, onConfirm, onClose } = props;
  const [failed, setFailed] = useState(false);
  const running = useRef(false);

  async function confirm(): Promise<void> {
    if (running.current) return;
    running.current = true;
    setFailed(false);
    try {
      setFailed(!(await onConfirm()));
    } catch {
      setFailed(true);
    } finally {
      running.current = false;
    }
  }

  return (
    <Dialog
      title={title}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" busy={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {failed && <Notice>La suppression a échoué. Réessayez.</Notice>}
      <p>{children}</p>
      {busy && (
        <p className="sr-only" role="status">
          Suppression en cours…
        </p>
      )}
    </Dialog>
  );
}
