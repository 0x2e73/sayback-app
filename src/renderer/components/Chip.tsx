import type { ButtonHTMLAttributes, Ref } from 'react';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  /** `md` is a 32 px toggle that takes an icon as its first child. */
  size?: 'sm' | 'md';
  ref?: Ref<HTMLButtonElement>;
}

export function Chip({
  pressed,
  size = 'sm',
  className = '',
  type = 'button',
  ref,
  ...attributes
}: ChipProps) {
  return (
    <button
      {...attributes}
      ref={ref}
      type={type}
      className={`chip ${className}`.trim()}
      data-size={size === 'md' ? 'md' : undefined}
      aria-pressed={pressed}
    />
  );
}
