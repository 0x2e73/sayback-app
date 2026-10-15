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

  /** Escape folds an open panel first; true when it did. */
  function escape(): boolean {
    if (!panel.open) return false;
    collapse();
    return true;
  }

  return { ...panel, trigger, toggle, collapse, escape };
}

export type SourcePanel = ReturnType<typeof useSourcePanel>;
