import type { ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}

export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    className = '',
    busy = false,
    type = 'button',
    children,
    disabled,
    ...attributes
  } = props;
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...attributes}
    >
      <span className="button-label">{children}</span>
      {busy && <LoaderCircle size={16} className="spin button-spinner" aria-hidden="true" />}
    </button>
  );
}
