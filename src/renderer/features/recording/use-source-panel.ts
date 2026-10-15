import { useRef, useState, type MouseEvent } from 'react';

/** The « Changer » panel. Opened with the keyboard, it appears at once instead of fading in. */
export function useSourcePanel() {
  const [panel, setPanel] = useState({ open: false, instant: false });
  const trigger = useRef<HTMLButtonElement>(null);

  function toggle(event: MouseEvent): void {
    setPanel({ open: !panel.open, instant: event.detail === 0 });
  }

  /** Folding gives the focus back to the button that opened the panel. */
  function collapse(): void {
    setPanel({ open: false, instant: true });
    trigger.current?.focus();
  }

  /** Folds it without moving the focus: the list it showed is gone or about to change. */
  function reset(): void {
    setPanel({ open: false, instant: true });
  }

  /** Escape folds a panel that is on screen first; true when it did. */
  function escape(visible: boolean): boolean {
    if (!panel.open || !visible) return false;
    collapse();
    return true;
  }

  return { ...panel, trigger, toggle, collapse, reset, escape };
}

export type SourcePanel = ReturnType<typeof useSourcePanel>;
