import { app, nativeTheme, protocol, safeStorage, type BrowserWindow } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServices, type DesktopServices } from './services';
import { createIpcRegistrar } from './ipc';
import { createWindowRoles } from './window-roles';
import {
  registerFolderHandlers,
  registerMeetingHandlers,
  registerSettingsHandlers,
} from './meeting-handlers';
import { registerCapture } from './capture-permissions';
import { registerWindowHandlers } from './full-screen';
import { createWindow } from './window';
import { createMenuBarActions } from './menu-bar-actions';
import { createElectronMenuBar } from './menu-bar-electron';
import { registerMenuBarHandlers, type MenuBar } from './menu-bar';
import { serveMedia } from './media-protocol';
import { createUpdateService } from './updates';
import { registerUpdateHandlers } from './update-handlers';
import { APP_NAME } from '../shared/update-channel';
import type { UpdateService } from '../backend/application/updates';
import type { Appearance } from '../shared/contracts';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'meeting-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

app.setName(APP_NAME);
const legacyDataRoot = join(app.getPath('appData'), 'voice-meets');
const dataRoot =
  process.env.SAYBACK_DATA_DIR ??
  process.env.VOICE_MEETS_DATA_DIR ??
  (existsSync(legacyDataRoot) ? legacyDataRoot : join(app.getPath('appData'), 'SayBack'));
mkdirSync(dataRoot, { recursive: true });
app.setPath('userData', dataRoot);
const rendererPath = join(import.meta.dirname, '../renderer/index.html');
// The development server URL is never honoured by a packaged app.
const devRendererUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
const rendererUrl = devRendererUrl ?? pathToFileURL(rendererPath).href;
let window: BrowserWindow | null = null;
let services: DesktopServices | undefined;
let updates: UpdateService | undefined;
let menuBar: MenuBar | null = null;

function isRecording(): boolean {
  return services?.meetings.list().some((meeting) => meeting.status === 'recording') ?? false;
}

function applyAppearance(value: Appearance): void {
  nativeTheme.themeSource = value;
}

function openWindow(): BrowserWindow | null {
  if (!services) return null;
  const opened = createWindow({ rendererUrl, isRecording });
  window = opened;
  opened.on('closed', () => {
    window = null;
  });
  return opened;
}

void app.whenReady().then(() => {
  const root = app.getPath('userData');
  const desktop = createServices(root, {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  });
  services = desktop;
  // One switch: the CSS, the vibrancy, the scrollbars, the menus and the system dialogs follow it.
  applyAppearance(desktop.credentials.settings().appearance);
  const { handle } = createIpcRegistrar(
    createWindowRoles({ main: () => window, island: () => null }),
  );
  registerMeetingHandlers(handle, desktop);
  registerFolderHandlers(handle, desktop);
  registerSettingsHandlers(handle, desktop, root, applyAppearance);
  registerCapture(handle, () => window);
  registerWindowHandlers(handle, () => window);
  updates = createUpdateService({ getWindow: () => window, isRecording });
  registerUpdateHandlers(handle, updates);
  void updates.start();
  protocol.handle('meeting-media', (request) =>
    serveMedia(request, desktop.media, desktop.meetings),
  );
  const menuBarActions = createMenuBarActions({
    getWindow: () => window,
    openWindow,
    isRecording,
    quitApp: () => app.quit(),
  });
  // A single icon for the whole run: `activate` and page reloads never come through here.
  menuBar = createElectronMenuBar(menuBarActions);
  registerMenuBarHandlers(
    handle,
    { announce: (state) => menuBar?.announce(state) },
    menuBarActions.rendererReady,
  );
  openWindow();
});

app.on('activate', () => {
  if (!window) openWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
// Back in the foreground: the update channel is re-read.
app.on('browser-window-focus', () => updates?.windowFocused());
app.on('will-quit', () => {
  menuBar?.destroy();
  void updates?.stop();
  services?.close();
});
