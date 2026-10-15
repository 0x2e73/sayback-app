import { randomUUID } from 'node:crypto';
import { screenSwitchAnswerSchema, type ScreenSwitchRequest } from '../shared/screen-switch';
import type { IpcRegistrar } from './ipc';

export const SWITCH_REQUEST = 'recording:switch-screen';
/** Room for `getDisplayMedia` and the new recorders: a switch that takes longer has failed. */
export const SWITCH_TIMEOUT = 20_000;
// One switch at a time; a few a second is a stuck page, not a person.
const MESSAGES_PER_SECOND = 5;

export interface SwitchContents {
  isDestroyed(): boolean;
  send(channel: string, payload: ScreenSwitchRequest): void;
  executeJavaScript(code: string, userGesture: boolean): Promise<unknown>;
}

export interface ScreenSwitchRelayDeps {
  /** The live main window, or null once it is closed. */
  getWindow(): { webContents: SwitchContents } | null;
  newId?(): string;
}

export interface ScreenSwitchRelay {
  /** Asks the page that records to capture this screen; false when it could not. */
  switchScreen(screenId: string): Promise<boolean>;
  /** The page's answer, unvalidated. */
  answer(input: unknown): void;
}

export function createScreenSwitchRelay({
  getWindow,
  newId = randomUUID,
}: ScreenSwitchRelayDeps): ScreenSwitchRelay {
  const pending = new Map<string, (ok: boolean) => void>();

  // As for a start: the page may be hidden, and getDisplayMedia may ask for a gesture.
  async function ask(
    contents: SwitchContents,
    id: string,
    screenId: string,
    expired: () => boolean,
  ) {
    try {
      await contents.executeJavaScript('void 0', true);
    } catch {
      return false;
    }
    if (expired()) return false;
    return new Promise<boolean>((resolve) => {
      pending.set(id, resolve);
      try {
        contents.send(SWITCH_REQUEST, { id, screenId });
      } catch {
        resolve(false);
      }
    });
  }

  return {
    // One deadline for the activation and the answer: a page that never settles either fails.
    async switchScreen(screenId) {
      const contents = getWindow()?.webContents;
      if (!contents || contents.isDestroyed()) return false;
      const id = newId();
      let expired = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          resolve(false);
        }, SWITCH_TIMEOUT);
      });
      try {
        return await Promise.race([ask(contents, id, screenId, () => expired), timeout]);
      } finally {
        clearTimeout(timer);
        pending.delete(id);
      }
    },
    answer(input) {
      const { id, ok } = screenSwitchAnswerSchema.parse(input);
      pending.get(id)?.(ok);
    },
  };
}

/** The answer comes from the main page only. */
export function registerScreenSwitchRelay({ handle }: IpcRegistrar, relay: ScreenSwitchRelay) {
  handle('recording:switch-result', (input) => relay.answer(input), ['main'], MESSAGES_PER_SECOND);
}
