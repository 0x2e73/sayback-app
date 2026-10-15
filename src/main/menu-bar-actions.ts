import type { RecordingRequest } from '../shared/recording-state';

export const MENU_BAR_NEW_RECORDING = 'menu-bar:new-recording';
/** Pause, resume or stop, asked to the page that owns the capture. */
export const RECORDING_REQUEST = 'recording:request';

export interface MenuBarWindow {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  webContents: { isLoading(): boolean; send(channel: string, ...args: unknown[]): void };
}

interface ActionDeps {
  getWindow(): MenuBarWindow | null;
  openWindow(): MenuBarWindow | null;
  isRecording(): boolean;
  quitApp(): void;
}

export interface MenuBarWindowActions {
  newRecording(): void;
  stopRecording(): void;
  /** The page ignores a request that does not apply, such as a pause while paused. */
  request(request: RecordingRequest): void;
  open(): void;
  quit(): void;
  /** The page has subscribed: a request made while it was loading can now reach it. */
  rendererReady(): void;
}

export function createMenuBarActions(deps: ActionDeps): MenuBarWindowActions {
  let pendingNewRecording = false;

  // Brings the window forward, reopening it when it was closed.
  function reveal(): { window: MenuBarWindow; reopened: boolean } | null {
    const existing = deps.getWindow();
    const window = existing ?? deps.openWindow();
    if (!window) return null;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return { window, reopened: !existing };
  }

  function request(request: RecordingRequest): void {
    deps.getWindow()?.webContents.send(RECORDING_REQUEST, request);
  }

  return {
    newRecording() {
      const shown = reveal();
      if (!shown) return;
      if (shown.reopened || shown.window.webContents.isLoading()) {
        pendingNewRecording = true;
        return;
      }
      shown.window.webContents.send(MENU_BAR_NEW_RECORDING);
    },
    stopRecording: () => request('stop'),
    request,
    open() {
      reveal();
    },
    quit() {
      // The refusal to close during a recording is shown on the window: it must be visible.
      if (deps.isRecording()) reveal();
      deps.quitApp();
    },
    rendererReady() {
      if (!pendingNewRecording) return;
      pendingNewRecording = false;
      deps.getWindow()?.webContents.send(MENU_BAR_NEW_RECORDING);
    },
  };
}
