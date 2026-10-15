import type { CapturePrefsStore } from '../backend/infrastructure/capture-prefs-store';
import type { RegisterHandler } from './ipc';

// A person changes a habit a few times, not dozens, a second.
const PREFS_PER_SECOND = 5;

export function registerCapturePrefs(handle: RegisterHandler, store: CapturePrefsStore): void {
  handle('capture-prefs:get', () => store.get());
  handle('capture-prefs:set', (input) => store.set(input), ['main'], PREFS_PER_SECOND);
}
