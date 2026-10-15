import { useCallback, useEffect, useRef, useState } from 'react';

/** The check stays on the picked tile this long before the picker closes. */
export const PICKED_HOLD = 180;

interface PickerOptions {
  /** Expanded and free: false closes the picker, which opens closed again. */
  active: boolean;
  /** The screen in use: its tile is checked. */
  current: string | null;
  onPick(screenId: string): void;
}

/**
 * Open or closed, and the tile checked while a pick is sent. `instantly`: the change came from
 * the keyboard, and the layers swap without motion.
 */
export function useScreenPicker({ active, current, onPick }: PickerOptions) {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) {
      setOpen(false);
      setPicked(null);
    }
  }

  useEffect(() => () => clearTimeout(closing.current), []);

  const close = useCallback((instantly = false) => {
    clearTimeout(closing.current);
    setInstant(instantly);
    setOpen(false);
    setPicked(null);
  }, []);

  function toggle(instantly = false): void {
    if (open) return close(instantly);
    if (!active) return;
    setInstant(instantly);
    setOpen(true);
  }

  function pick(screenId: string, instantly = false): void {
    if (screenId === current) return close(instantly);
    setPicked(screenId);
    onPick(screenId);
    clearTimeout(closing.current);
    closing.current = setTimeout(() => close(instantly), PICKED_HOLD);
  }

  return { open: open && active, instant, checked: picked ?? current, toggle, close, pick };
}

export type ScreenPickerState = ReturnType<typeof useScreenPicker>;
