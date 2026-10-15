import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Result } from '../shared/contracts';
import type { WindowRole, WindowRoles } from './window-roles';

/** `invoke` channel; only the main window may call it unless other roles are named. */
export type RegisterHandler = (
  channel: string,
  action: (...args: unknown[]) => unknown,
  roles?: readonly WindowRole[],
) => void;

/** `send` channel: no answer, so invalid input and foreign senders are dropped silently. */
export type RegisterListener = (
  channel: string,
  action: (...args: unknown[]) => void,
  roles?: readonly WindowRole[],
) => void;

export interface IpcRegistrar {
  handle: RegisterHandler;
  listen: RegisterListener;
}

const MAIN_ONLY: readonly WindowRole[] = ['main'];

function transportError(error: unknown): string {
  if (error instanceof z.ZodError) return 'Vérifiez les informations saisies.';
  if (error instanceof Error) return error.message;
  return 'Une erreur est survenue.';
}

export function createIpcRegistrar(windowRoles: WindowRoles): IpcRegistrar {
  return {
    handle(channel, action, roles = MAIN_ONLY) {
      ipcMain.handle(channel, async (event, ...args): Promise<Result<unknown>> => {
        if (!windowRoles.allows(event, roles)) return { ok: false, error: 'Accès refusé.' };
        try {
          return { ok: true, value: await action(...args) };
        } catch (error) {
          return { ok: false, error: transportError(error) };
        }
      });
    },
    listen(channel, action, roles = MAIN_ONLY) {
      ipcMain.on(channel, (event, ...args) => {
        if (!windowRoles.allows(event, roles)) return;
        try {
          action(...args);
        } catch {
          // A malformed message is dropped: the sender expects no answer.
        }
      });
    },
  };
}
