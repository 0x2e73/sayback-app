import type { UpdateService } from '../backend/application/updates';
import type { RegisterHandler } from './ipc';

// No payload crosses these channels from the renderer: there is nothing to validate but the
// sender, which the registrar checks. Refusals carry a sentence ready for the interface.
export function registerUpdateHandlers(handle: RegisterHandler, updates: UpdateService) {
  handle('updates:status', () => updates.status());
  handle('updates:check', () => updates.check());
  handle('updates:install', () => updates.install());
}
