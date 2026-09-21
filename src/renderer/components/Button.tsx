import type { ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}

export function Button(props: ButtonProps) {
  const { variant = 'primary', className = '', busy, children, disabled, ...attributes } = props;
  return (
    <button
      className={`button button-${variant} ${className}`}
      disabled={disabled || busy}
      {...attributes}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
