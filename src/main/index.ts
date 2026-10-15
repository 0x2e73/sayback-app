import {
  app,
  nativeTheme,
  powerSaveBlocker,
  protocol,
  safeStorage,
  type BrowserWindow,
} from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServices, type DesktopServices } from './services';
import { createIpcRegistrar } from './ipc';
import { createWindowRoles } from './window-roles';
import {
  openPrivacyPane,
  registerFolderHandlers,
  registerMeetingHandlers,
  registerSettingsHandlers,
} from './meeting-handlers';
import { listScreens, registerCapture } from './capture-permissions';
import { capturePermission } from './capture-sources';
import { createCapturePrefsStore } from '../backend/infrastructure/capture-prefs-store';
import { registerCapturePrefs } from './capture-prefs';
import { registerWindowHandlers } from './full-screen';
import { createWindow } from './window';
import { createMenuBarActions } from './menu-bar-actions';
import { createElectronMenuBar } from './menu-bar-electron';
import type { MenuBar } from './menu-bar';
import { createRecordingStateHub, registerRecordingState } from './recording-state-hub';
import { createRecordingPower } from './recording-power';
import type { Island } from './island-controller';
import { registerIslandHandlers } from './island-handlers';
import { createElectronIsland } from './island-window';
import { createStartRelay, registerStartRelay } from './start-relay';
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
const islandUrl = devRendererUrl
  ? `${devRendererUrl}/island.html`
  : pathToFileURL(join(import.meta.dirname, '../renderer/island.html')).href;
let window: BrowserWindow | null = null;
let services: DesktopServices | undefined;
let updates: UpdateService | undefined;
let menuBar: MenuBar | null = null;
let island: Island | null = null;
const recordingState = createRecordingStateHub();

function isRecording(): boolean {
  return services?.meetings.list().some((meeting) => meeting.status === 'recording') ?? false;
}

function applyAppearance(value: Appearance): void {
  nativeTheme.themeSource = value;
}

function liveWindow(): BrowserWindow | null {
  return window && !window.isDestroyed() ? window : null;
}

function livePage() {
  return liveWindow()?.webContents ?? null;
}

// Hidden, it only carries a capture started from the island, and is never shown for it.
function openWindow(show = true): BrowserWindow | null {
  if (!services) return null;
  const opened = createWindow({ rendererUrl, isRecording, show });
  window = opened;
  recordingState.watch(opened.webContents);
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
  const registrar = createIpcRegistrar(
    createWindowRoles({ main: liveWindow, island: () => island?.window() ?? null }),
  );
  const { handle } = registrar;
  registerMeetingHandlers(handle, desktop);
  registerFolderHandlers(handle, desktop);
  registerSettingsHandlers(handle, desktop, root, applyAppearance);
  registerCapture(
    handle,
    () => window,
    () => [window, island?.window() ?? null],
  );
  const capturePrefs = createCapturePrefsStore(join(root, 'capture-prefs.json'));
  registerCapturePrefs(handle, capturePrefs);
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
  const startRelay = createStartRelay({
    getWindow: liveWindow,
    openHiddenWindow: () => openWindow(false),
  });
  registerStartRelay(handle, startRelay);
  // A single icon for the whole run: `activate` and page reloads never come through here.
  menuBar = createElectronMenuBar(menuBarActions, () => island?.toggle());
  recordingState.subscribe((snapshot) => menuBar?.announce(snapshot));
  recordingState.subscribe(createRecordingPower({ page: livePage, blocker: powerSaveBlocker }));
  registerRecordingState(handle, recordingState, () => {
    menuBarActions.rendererReady();
    startRelay.rendererReady();
  });
  island = createElectronIsland({
    hub: recordingState,
    url: islandUrl,
    preload: join(import.meta.dirname, '../preload/island.cjs'),
    ready: {
      prefs: () => capturePrefs.get(),
      screens: listScreens,
      screenPermission: () => capturePermission('screen'),
      today: () => new Date(),
      start: (payload) => startRelay.start(payload),
    },
    openApp: menuBarActions.open,
    openDialog: menuBarActions.newRecording,
    openPrivacySettings: () => {
      openPrivacyPane('screen').catch((error: unknown) => {
        console.error('[island] opening the screen recording settings failed', error);
      });
    },
    request: menuBarActions.request,
  });
  if (island) registerIslandHandlers(registrar, island);
  openWindow();
});

// The window may be hidden, carrying a capture started from the island: the Dock shows it.
app.on('activate', () => {
  if (!window) openWindow();
  else if (!window.isVisible()) window.show();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
// Back in the foreground: the update channel is re-read.
app.on('browser-window-focus', () => updates?.windowFocused());
app.on('will-quit', () => {
  island?.close();
  menuBar?.destroy();
  void updates?.stop();
  services?.close();
});
