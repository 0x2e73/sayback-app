import type { ReactNode } from 'react';
import { Presence } from '../components/Presence';

interface PickerSwapProps {
  open: boolean;
  /** Opened or closed from the keyboard: no motion. */
  instant: boolean;
  /** What the picker replaces: the sources and the screen line, or the recording scene. */
  base: ReactNode;
  picker: ReactNode;
}

/** Both layers share one cell: the island never grows, the hidden layer is inert. */
export function PickerSwap({ open, instant, base, picker }: PickerSwapProps) {
  return (
    <div className="island-swap" data-instant={instant || undefined}>
      <div
        className="island-swap-base"
        data-state={open ? 'closing' : 'open'}
        inert={open}
        aria-hidden={open || undefined}
      >
        {base}
      </div>
      <Presence open={open}>
        {({ ref, state }) => (
          <div
            ref={ref}
            className="island-swap-picker"
            data-state={state}
            inert={state === 'closing'}
            aria-hidden={state === 'closing' || undefined}
          >
            {picker}
          </div>
        )}
      </Presence>
    </div>
  );
}
