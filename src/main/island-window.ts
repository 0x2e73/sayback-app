import { BrowserWindow, screen, type BrowserWindowConstructorOptions } from 'electron';
import type { RecordingRequest } from '../shared/recording-state';
import { createIsland, type Island } from './island-handlers';
import { islandLayout, type DisplayInfo, type IslandLayout, type Rect } from './island-geometry';
import { startIslandHover } from './island-hover';
import { createNotchProbe, notchesOf, type NotchProbe } from './notch-probe';
import type { RecordingStateHub } from './recording-state-hub';

export function islandWindowOptions(
  preload: string,
  bounds: Rect,
): BrowserWindowConstructorOptions {
  return {
    ...bounds,
    frame: false,
    transparent: true,
    hasShadow: false,
    type: 'panel',
    focusable: false,
    acceptFirstMouse: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    // The island hangs over the menu bar, outside the work area.
    enableLargerThanScreen: true,
    show: false,
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  };
}

function openIslandWindow(url: string, preload: string, layout: IslandLayout): BrowserWindow {
  const window = new BrowserWindow(islandWindowOptions(preload, layout.window));
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  // Kept out of screen sharing and of the stored video, where macOS honours it.
  window.setContentProtection(true);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  void window.loadURL(url);
  return window;
}

function currentDisplays(): { displays: DisplayInfo[]; primaryId: number } {
  const displays = screen.getAllDisplays().map((display) => ({
    id: display.id,
    bounds: display.bounds,
    workArea: display.workArea,
    internal: display.internal,
  }));
  return { displays, primaryId: screen.getPrimaryDisplay().id };
}

async function readLayout(probe: NotchProbe): Promise<IslandLayout | null> {
  const screens = await probe.read();
  const { displays, primaryId } = currentDisplays();
  const notches = screens ? notchesOf(displays, screens) : null;
  return islandLayout({ displays, primaryId, notches });
}

interface ElectronIslandDeps {
  hub: Pick<RecordingStateHub, 'current' | 'elapsed' | 'subscribe'>;
  url: string;
  preload: string;
  openApp(): void;
  request(request: RecordingRequest): void;
}

// The island exists on macOS only: elsewhere the menu bar icon is enough.
export function createElectronIsland(deps: ElectronIslandDeps): Island | null {
  if (process.platform !== 'darwin') return null;
  const probe = createNotchProbe();
  const island = createIsland({
    hub: deps.hub,
    layout: () => readLayout(probe),
    openWindow: (layout) => openIslandWindow(deps.url, deps.preload, layout),
    startHover: (area, onChange) =>
      startIslandHover({ cursor: () => screen.getCursorScreenPoint(), area, onChange }),
    openApp: deps.openApp,
    request: deps.request,
  });
  const screensChanged = () => {
    probe.invalidate();
    void island.screensChanged();
  };
  screen.on('display-added', screensChanged);
  screen.on('display-removed', screensChanged);
  screen.on('display-metrics-changed', screensChanged);
  return island;
}
