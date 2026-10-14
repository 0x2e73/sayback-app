import { useEffect, type RefObject } from 'react';
import { platformOf } from '../../platform';

export interface ShortcutKey {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// On macOS, Ctrl+F moves the caret forward in every text field: only Cmd+F is "find".
export function isFindShortcut(event: ShortcutKey, platform: 'mac' | 'other'): boolean {
  if (event.key.toLowerCase() !== 'f' || event.altKey || event.shiftKey) return false;
  if (platform === 'mac') return event.metaKey && !event.ctrlKey;
  return event.ctrlKey && !event.metaKey;
}

export function useFindShortcut(
  field: RefObject<HTMLInputElement | null>,
  platform = platformOf(navigator.platform),
): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const input = field.current;
      if (!input || !isFindShortcut(event, platform)) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [field, platform]);
}
