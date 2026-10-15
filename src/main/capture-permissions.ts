import {
  app,
  desktopCapturer,
  screen,
  session,
  type BrowserWindow,
  type WebContents,
} from 'electron';
import { z } from 'zod';
import type { CaptureSource } from '../shared/contracts';
import { captureKindSchema } from '../shared/validation';
import { capturePermission, ownSourceIds, presentSources, type OwnWindow } from './capture-sources';
import type { RegisterHandler } from './ipc';

type SourceKind = 'screen' | 'window';

function macCaptureApp(): string {
  return app.isPackaged
    ? 'SayBack'
    : 'Terminal.app ou Electron (selon l’application affichée par macOS)';
}

/** The capture sources without SayBack's own windows, the main screen first as « Écran 1 ». */
export async function listCaptureSources(
  own: readonly (OwnWindow | null)[],
  types: SourceKind[],
): Promise<CaptureSource[]> {
  let sources;
  try {
    sources = await desktopCapturer.getSources({
      types,
      thumbnailSize: { width: 240, height: 150 },
    });
  } catch {
    throw new Error(
      process.platform === 'darwin'
        ? `Impossible de lister les écrans. Vérifiez ${macCaptureApp()} dans Réglages Système > Confidentialité et sécurité > Enregistrement de l’écran et des sons du système, puis réessayez.`
        : 'Impossible de lister les écrans. Vérifiez les autorisations de capture, puis réessayez.',
    );
  }
  if (!sources.length) {
    throw new Error(
      process.platform === 'darwin'
        ? `Aucun écran disponible. Activez ${macCaptureApp()} dans Réglages Système > Confidentialité et sécurité > Enregistrement de l’écran et des sons du système, puis relancez l’application.`
        : 'Aucun écran disponible. Vérifiez les autorisations de capture.',
    );
  }
  const primaryDisplayId = String(screen.getPrimaryDisplay().id);
  return presentSources(sources, primaryDisplayId, ownSourceIds(own));
}

/** The screens for the ready island, without thumbnails; empty when they cannot be listed. */
export async function listScreens(): Promise<Pick<CaptureSource, 'id' | 'name' | 'primary'>[]> {
  try {
    const sources = await listCaptureSources([], ['screen']);
    return sources.map(({ id, name, primary }) => (primary ? { id, name, primary } : { id, name }));
  } catch {
    return [];
  }
}

interface SourceSelection {
  id: string;
  systemAudio: boolean;
}

export function registerCapture(
  handle: RegisterHandler,
  getWindow: () => BrowserWindow | null,
  // SayBack's windows, main and island: sharing them would film the recording itself.
  ownWindows: () => (OwnWindow | null)[] = () => [getWindow()],
) {
  let chosenSource: SourceSelection | undefined;
  // Writing the notes to the clipboard needs its own permission; reading it stays refused.
  const allowedPermissions = new Set([
    'media',
    'display-capture',
    'fullscreen',
    'clipboard-sanitized-write',
  ]);
  const canUsePermission = (contents: WebContents | null, permission: string) =>
    contents === getWindow()?.webContents && allowedPermissions.has(permission);
  handle('capture:sources', () => listCaptureSources(ownWindows(), ['screen', 'window']));
  handle('capture:permission', (kind) => capturePermission(captureKindSchema.parse(kind)));
  handle('capture:select', (id, systemAudio) => {
    chosenSource = z
      .object({
        id: z.string().min(1).max(200),
        systemAudio: z.boolean(),
      })
      .parse({ id, systemAudio });
  });

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(canUsePermission(contents, permission));
  });
  session.defaultSession.setPermissionCheckHandler(canUsePermission);
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (request.frame !== getWindow()?.webContents.mainFrame || !chosenSource)
        return callback({});
      const selected = chosenSource;
      chosenSource = undefined;
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const source = sources.find((item) => item.id === selected.id);
      if (!source) return callback({});
      callback({ video: source, ...(selected.systemAudio ? { audio: 'loopback' as const } : {}) });
    } catch {
      callback({});
    }
  });
}
