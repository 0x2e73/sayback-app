import { useEffect, type RefObject } from 'react';
import { platformOf } from '../platform';

export interface ShortcutKey {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// On macOS, Ctrl+F moves the caret forward in every text field: only Cmd+F is "find".
export function isFindShortcut(event: ShortcutKey, platform: 'mac' | 'other'): boolean {
  // The physical key counts too: on a non-Latin layout, F types another letter.
  const isF = event.key.toLowerCase() === 'f' || event.code === 'KeyF';
  if (!isF || event.altKey || event.shiftKey) return false;
  if (platform === 'mac') return event.metaKey && !event.ctrlKey;
  return event.ctrlKey && !event.metaKey;
}

export interface FindShortcutOptions {
  enabled?: boolean;
  /** Claims Cmd+F before the other listeners: the transcript search, while it is shown. */
  first?: boolean;
}

export function useFindShortcut(
  field: RefObject<HTMLInputElement | null>,
  platform = platformOf(navigator.platform),
  { enabled = true, first = false }: FindShortcutOptions = {},
): void {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent): void {
      const input = field.current;
      if (!input || event.defaultPrevented || !isFindShortcut(event, platform)) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    window.addEventListener('keydown', onKeyDown, { capture: first });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: first });
  }, [field, platform, enabled, first]);
}
