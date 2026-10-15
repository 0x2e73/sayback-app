import { useEffect, useRef, type RefObject } from 'react';
import type { IslandRequest } from '../../shared/island';

interface ReadyEscapeOptions {
  /** Open and not handing over to the recording: the island takes the keyboard. */
  active: boolean;
  pickerOpen: boolean;
  closePicker(instantly: boolean): void;
  onRequest(request: IslandRequest): void;
  /** « Changer d'écran »: the focus comes back to it when the picker closes. */
  trigger: RefObject<HTMLButtonElement | null>;
}

/**
 * The ready island handles Escape itself: the picker open, it closes the picker; else it asks
 * main to close the island, which waits for a busy start.
 */
export function useReadyEscape(options: ReadyEscapeOptions): void {
  const { active, pickerOpen, trigger } = options;
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const current = latest.current;
      if (current.pickerOpen) current.closePicker(true);
      else current.onRequest('close');
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [active]);

  useEffect(() => {
    if (!pickerOpen) return;
    // Hidden with the sources while the picker is open, never unmounted meanwhile.
    const button = trigger.current;
    return () => {
      const focused = document.activeElement;
      if (!focused || focused === document.body || focused.closest('[data-picker]')) {
        button?.focus();
      }
    };
  }, [pickerOpen, trigger]);
}
