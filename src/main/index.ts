import { app, nativeTheme, protocol, safeStorage, type BrowserWindow } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServices, type DesktopServices } from './services';
import { createIpcRegistrar } from './ipc';
import {
  registerFolderHandlers,
  registerMeetingHandlers,
  registerSettingsHandlers,
} from './meeting-handlers';
import { registerCapture } from './capture-permissions';
import { createWindow } from './window';
import { serveMedia } from './media-protocol';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'meeting-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

app.setName('SayBack');
const legacyDataRoot = join(app.getPath('appData'), 'voice-meets');
const dataRoot =
  process.env.SAYBACK_DATA_DIR ??
  process.env.VOICE_MEETS_DATA_DIR ??
  (existsSync(legacyDataRoot) ? legacyDataRoot : join(app.getPath('appData'), 'SayBack'));
mkdirSync(dataRoot, { recursive: true });
app.setPath('userData', dataRoot);
const rendererPath = join(import.meta.dirname, '../renderer/index.html');
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(rendererPath).href;
let window: BrowserWindow | null = null;
let services: DesktopServices | undefined;

function openWindow() {
  if (!services) return;
  const meetings = services.meetings;
  window = createWindow({
    rendererUrl,
    isRecording: () => meetings.list().some((meeting) => meeting.status === 'recording'),
  });
  window.on('closed', () => {
    window = null;
  });
}

void app.whenReady().then(() => {
  // The app has a single dark theme: title bar, menus and system dialogs follow it.
  nativeTheme.themeSource = 'dark';
  const root = app.getPath('userData');
  const desktop = createServices(root, {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  });
  services = desktop;
  const handle = createIpcRegistrar(() => window);
  registerMeetingHandlers(handle, desktop);
  registerFolderHandlers(handle, desktop);
  registerSettingsHandlers(handle, desktop, root);
  registerCapture(handle, () => window);
  protocol.handle('meeting-media', (request) =>
    serveMedia(request, desktop.media, desktop.meetings),
  );
  openWindow();
});

app.on('activate', () => {
  if (!window) openWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => services?.close());
