import type { RegisterHandler } from './ipc';

interface FullScreenWindow {
  on(event: 'enter-full-screen' | 'leave-full-screen', listener: () => void): unknown;
  webContents: { send(channel: string, fullScreen: boolean): void; isDestroyed(): boolean };
}

interface FullScreenState {
  isFullScreen(): boolean;
}

// Chromium does not expose native full screen to CSS, so the main process tells the page.
export function relayFullScreen(window: FullScreenWindow): void {
  // The event can land while the window closes: sending to a destroyed page throws.
  const tell = (fullScreen: boolean) => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send('window:full-screen-changed', fullScreen);
    }
  };
  window.on('enter-full-screen', () => tell(true));
  window.on('leave-full-screen', () => tell(false));
}

export function registerWindowHandlers(
  handle: RegisterHandler,
  getWindow: () => FullScreenState | null,
): void {
  handle('window:is-full-screen', () => getWindow()?.isFullScreen() ?? false);
}
