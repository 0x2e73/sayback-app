import type { CapturePrefsStore } from '../backend/infrastructure/capture-prefs-store';
import type { RegisterHandler } from './ipc';

export function registerCapturePrefs(handle: RegisterHandler, store: CapturePrefsStore): void {
  handle('capture-prefs:get', () => store.get());
  handle('capture-prefs:set', (input) => store.set(input));
}
