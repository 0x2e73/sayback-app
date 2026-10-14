import { useRef, useState } from 'react';

/** The folder menu hangs under the chip that opened it, measured against its wrapper. */
export function useFolderMenu() {
  const [left, setLeft] = useState<number | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  function toggle(): void {
    const chip = anchor.current?.getBoundingClientRect();
    const box = wrapper.current?.getBoundingClientRect();
    if (left !== null || !chip || !box) {
      setLeft(null);
      return;
    }
    setLeft(Math.max(0, chip.left - box.left));
  }

  function close(restoreFocus = false): void {
    setLeft(null);
    if (restoreFocus) anchor.current?.focus();
  }

  return { left, anchor, wrapper, toggle, close };
}
