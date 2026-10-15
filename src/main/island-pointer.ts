import { debounce } from './debounce';
import type { IslandWindowPort } from './island-ports';

// The time of the opening animation: a click aimed at what was under the island stays there.
export const CLICK_GUARD = 250;

export interface IslandPointer {
  /** Open: takes clicks once the opening animation is over. Closed: every click goes through. */
  expanded(open: boolean): void;
  /** Closed: takes clicks only while the cursor is within reach of the wings. */
  reach(reachable: boolean): void;
  /** Ready: focused, so a click elsewhere blurs it. Recording: never takes the keyboard. */
  focusable(focusable: boolean): void;
  reset(): void;
}

/** Whether the island window takes the mouse and the keyboard. */
export function createIslandPointer(window: () => IslandWindowPort | null): IslandPointer {
  let open = false;
  const guard = debounce(() => {
    if (open) window()?.setIgnoreMouseEvents(false);
  }, CLICK_GUARD);
  return {
    expanded(next) {
      open = next;
      if (next) return guard.call();
      guard.cancel();
      window()?.setIgnoreMouseEvents(true);
    },
    reach(reachable) {
      if (!open) window()?.setIgnoreMouseEvents(!reachable);
    },
    focusable(focusable) {
      const target = window();
      if (!target) return;
      target.setFocusable(focusable);
      if (focusable) target.focus();
    },
    reset() {
      open = false;
      guard.cancel();
    },
  };
}
