import type { RegisterHandler } from './ipc';

interface FullScreenWindow {
  on(event: 'enter-full-screen' | 'leave-full-screen', listener: () => void): unknown;
  webContents: { send(channel: string, fullScreen: boolean): void };
}

interface FullScreenState {
  isFullScreen(): boolean;
}

// Chromium does not expose native full screen to CSS, so the main process tells the page.
export function relayFullScreen(window: FullScreenWindow): void {
  window.on('enter-full-screen', () => window.webContents.send('window:full-screen-changed', true));
  window.on('leave-full-screen', () =>
    window.webContents.send('window:full-screen-changed', false),
  );
}

export function registerWindowHandlers(
  handle: RegisterHandler,
  getWindow: () => FullScreenState | null,
): void {
  handle('window:is-full-screen', () => getWindow()?.isFullScreen() ?? false);
}
