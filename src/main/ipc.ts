import { ipcMain, type BrowserWindow } from 'electron';
import { z } from 'zod';
import type { Result } from '../shared/contracts';

export type RegisterHandler = (channel: string, action: (...args: unknown[]) => unknown) => void;

function transportError(error: unknown): string {
  if (error instanceof z.ZodError) return 'Vérifiez les informations saisies.';
  if (error instanceof Error) return error.message;
  return 'Une erreur est survenue.';
}

export function createIpcRegistrar(getWindow: () => BrowserWindow | null): RegisterHandler {
  return (channel, action) => {
    ipcMain.handle(channel, async (event, ...args): Promise<Result<unknown>> => {
      const window = getWindow();
      const trusted =
        window &&
        event.sender === window.webContents &&
        event.senderFrame === window.webContents.mainFrame;
      if (!trusted) return { ok: false, error: 'Accès refusé.' };
      try {
        return { ok: true, value: await action(...args) };
      } catch (error) {
        return { ok: false, error: transportError(error) };
      }
    });
  };
}
