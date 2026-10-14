import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm(): void | Promise<void>;
  onClose(): void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, children, confirmLabel, busy = false, onConfirm, onClose } = props;
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
          <Button variant="danger" busy={busy} onClick={() => void onConfirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{children}</p>
    </Dialog>
  );
}
