import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface DialogProps {
  title: string;
  children: ReactNode;
  onClose(): void;
}

export function Dialog({ title, children, onClose }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <Button variant="ghost" onClick={onClose} aria-label="Fermer">
          <X size={18} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
