import type { ButtonHTMLAttributes, Ref } from 'react';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Chip({ pressed, className = '', type = 'button', ref, ...attributes }: ChipProps) {
  return (
    <button
      {...attributes}
      ref={ref}
      type={type}
      className={`chip ${className}`.trim()}
      aria-pressed={pressed}
    />
  );
}
