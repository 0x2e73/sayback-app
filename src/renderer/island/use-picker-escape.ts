import { useEffect, useRef, type RefObject } from 'react';
import type { IslandRequest } from '../../shared/island';

/**
 * Ready: while the picker is open main lets Escape through, and the page closes the picker
 * instead of the island; closed, the focus goes back to « Changer d'écran ».
 */
export function usePickerEscape(
  open: boolean,
  close: (instantly: boolean) => void,
  onRequest: (request: IslandRequest) => void,
  trigger: RefObject<HTMLButtonElement | null>,
): void {
  const latest = useRef(onRequest);
  useEffect(() => {
    latest.current = onRequest;
  });

  useEffect(() => {
    if (!open) return;
    // Hidden with the sources while the picker is open, never unmounted meanwhile.
    const button = trigger.current;
    latest.current('picker-opened');
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close(true);
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      latest.current('picker-closed');
      const focused = document.activeElement;
      if (!focused || focused === document.body || focused.closest('[data-picker]')) {
        button?.focus();
      }
    };
  }, [open, close, trigger]);
}
