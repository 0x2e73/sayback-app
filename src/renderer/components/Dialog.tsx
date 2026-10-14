import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface DialogProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  onClose(): void;
}

export function Dialog({ title, children, footer, busy = false, onClose }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // The padding lives on .dialog-inner, so only the backdrop targets the dialog itself.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <Button variant="ghost" onClick={close} disabled={busy} aria-label="Fermer">
            <X size={18} />
          </Button>
        </div>
        {children}
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </dialog>
  );
}
