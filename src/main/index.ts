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
  registerFolderHandlers,
  registerMeetingHandlers,
  registerSettingsHandlers,
} from './meeting-handlers';
import { registerCapture } from './capture-permissions';
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
import { composeLive } from './live-composition';
import { registerLiveHandlers } from './live-handlers';
import type { LiveServices } from './live-services';
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
// One SayBack per data folder: a second one would share the database, the recordings and the
// PID file of the live server. A second launch brings the first one forward and quits.
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
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
let live: LiveServices | null = null;
let revealApp: (() => void) | null = null;
let liveEnded = false;
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

function openWindow(): BrowserWindow | null {
  if (!services) return null;
  const opened = createWindow({ rendererUrl, isRecording });
  window = opened;
  recordingState.watch(opened.webContents);
  opened.on('closed', () => {
    window = null;
  });
  return opened;
}

void app.whenReady().then(() => {
  if (!primaryInstance) return;
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
  registerCapturePrefs(handle, createCapturePrefsStore(join(root, 'capture-prefs.json')));
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
  revealApp = menuBarActions.open;
  recordingState.subscribe((snapshot) => menuBar?.announce(snapshot));
  recordingState.subscribe(createRecordingPower({ page: livePage, blocker: powerSaveBlocker }));
  registerRecordingState(handle, recordingState, menuBarActions.rendererReady);
  island = createElectronIsland({
    hub: recordingState,
    url: islandUrl,
    preload: join(import.meta.dirname, '../preload/island.cjs'),
    openApp: menuBarActions.open,
    request: menuBarActions.request,
  });
  if (island) registerIslandHandlers(registrar, island);
  live = composeLive(
    recordingState,
    root,
    () => desktop.credentials.settings().whisperModelPath,
  ).live;
  registerLiveHandlers(registrar, live);
  openWindow();
});

app.on('second-instance', () => revealApp?.());
app.on('activate', () => {
  if (!window) openWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
// Back in the foreground: the update channel is re-read.
app.on('browser-window-focus', () => updates?.windowFocused());
app.on('will-quit', (event) => {
  // The quit waits for the live server to be gone: no process outlives the app.
  if (live && !liveEnded) {
    event.preventDefault();
    void live
      .shutdown()
      .catch((error: unknown) => console.error('[live] the engine did not stop', error))
      .then(() => {
        liveEnded = true;
        app.quit();
      });
    return;
  }
  island?.close();
  menuBar?.destroy();
  void updates?.stop();
  services?.close();
});
