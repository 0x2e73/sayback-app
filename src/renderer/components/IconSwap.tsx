import type { ReactNode } from 'react';

interface IconSwapProps {
  /** Shows `on` when true, `off` otherwise; both stay mounted and cross-fade. */
  active: boolean;
  on: ReactNode;
  off: ReactNode;
}

export function IconSwap({ active, on, off }: IconSwapProps) {
  return (
    <span className="icon-swap" aria-hidden="true">
      <span data-hidden={active ? undefined : ''}>{on}</span>
      <span data-hidden={active ? '' : undefined}>{off}</span>
    </span>
  );
}
