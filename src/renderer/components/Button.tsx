import type { ButtonHTMLAttributes, MouseEvent } from 'react';
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
    onClick,
    ...attributes
  } = props;
  // Busy keeps the button focusable (no `disabled`), so the focus survives the request.
  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    if (busy) event.preventDefault();
    else onClick?.(event);
  }
  return (
    <button
      {...attributes}
      type={type}
      className={`button button-${variant} ${className}`}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={handleClick}
    >
      <span className="button-label">{children}</span>
      {busy && <LoaderCircle size={16} className="spin button-spinner" aria-hidden="true" />}
    </button>
  );
}
