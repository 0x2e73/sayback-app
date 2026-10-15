import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Result } from '../shared/contracts';
import type { WindowRole, WindowRoles } from './window-roles';

/**
 * `invoke` channel; only the main window may call it unless other roles are named. With
 * `perSecond`, calls beyond that rate get an error answer instead of running.
 */
export type RegisterHandler = (
  channel: string,
  action: (...args: unknown[]) => unknown,
  roles?: readonly WindowRole[],
  perSecond?: number,
) => void;

/**
 * `send` channel carrying one payload: no answer, so invalid input, foreign senders and messages
 * beyond `perSecond` are dropped silently.
 */
export type RegisterListener = (
  channel: string,
  action: (payload: unknown) => void,
  roles?: readonly WindowRole[],
  perSecond?: number,
) => void;

export interface IpcRegistrar {
  handle: RegisterHandler;
  listen: RegisterListener;
}

const MAIN_ONLY: readonly WindowRole[] = ['main'];
// The level comes ten times a second: twice that is the most a channel takes by default.
const DEFAULT_RATE = 20;
const RATE_WINDOW = 1_000;

function transportError(error: unknown): string {
  if (error instanceof z.ZodError) return 'Vérifiez les informations saisies.';
  if (error instanceof Error) return error.message;
  return 'Une erreur est survenue.';
}

/** Counts the messages of one channel in fixed one-second windows. */
function rateLimiter(perSecond: number, now: () => number): () => boolean {
  let windowStart = -Infinity;
  let count = 0;
  return () => {
    const time = now();
    if (time - windowStart >= RATE_WINDOW) {
      windowStart = time;
      count = 0;
    }
    count += 1;
    return count <= perSecond;
  };
}

export function createIpcRegistrar(
  windowRoles: WindowRoles,
  now: () => number = () => performance.now(),
): IpcRegistrar {
  return {
    handle(channel, action, roles = MAIN_ONLY, perSecond) {
      const withinRate = perSecond === undefined ? () => true : rateLimiter(perSecond, now);
      ipcMain.handle(channel, async (event, ...args): Promise<Result<unknown>> => {
        if (!windowRoles.allows(event, roles)) return { ok: false, error: 'Accès refusé.' };
        if (!withinRate())
          return { ok: false, error: 'Trop de demandes. Réessayez dans un instant.' };
        try {
          return { ok: true, value: await action(...args) };
        } catch (error) {
          return { ok: false, error: transportError(error) };
        }
      });
    },
    listen(channel, action, roles = MAIN_ONLY, perSecond = DEFAULT_RATE) {
      const withinRate = rateLimiter(perSecond, now);
      ipcMain.on(channel, (event, ...args) => {
        if (args.length !== 1 || !windowRoles.allows(event, roles) || !withinRate()) return;
        try {
          action(args[0]);
        } catch {
          // A malformed message is dropped: the sender expects no answer.
        }
      });
    },
  };
}
