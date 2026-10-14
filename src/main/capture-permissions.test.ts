import { expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { RegisterHandler } from './ipc';

const electron = vi.hoisted(() => ({
  getMediaAccessStatus: vi.fn(() => 'denied'),
  getSources: vi.fn(async () => [
    {
      id: 'screen:1:0',
      name: 'Écran principal',
      thumbnail: { toDataURL: () => 'data:image/png;base64,test' },
    },
  ]),
  setPermissionRequestHandler: vi.fn(),
  setPermissionCheckHandler: vi.fn(),
  setDisplayMediaRequestHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
  desktopCapturer: { getSources: electron.getSources },
  systemPreferences: { getMediaAccessStatus: electron.getMediaAccessStatus },
  session: {
    defaultSession: {
      setPermissionRequestHandler: electron.setPermissionRequestHandler,
      setPermissionCheckHandler: electron.setPermissionCheckHandler,
      setDisplayMediaRequestHandler: electron.setDisplayMediaRequestHandler,
    },
  },
}));

import { registerCapture } from './capture-permissions';

it('lists capture sources even when the cached macOS status says denied', async () => {
  const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle: RegisterHandler = (channel, action) => {
    handlers.set(channel, action);
  };
  registerCapture(handle, () => null);

  let sources;
  try {
    sources = await handlers.get('capture:sources')?.();
  } finally {
    platform.mockRestore();
  }

  expect(electron.getSources).toHaveBeenCalled();
  expect(sources).toEqual([
    {
      id: 'screen:1:0',
      name: 'Écran principal',
      thumbnail: 'data:image/png;base64,test',
    },
  ]);
});

it('allows fullscreen only for the app window', () => {
  const contents = { id: 1 };
  const window = { webContents: contents } as unknown as BrowserWindow;
  const handle: RegisterHandler = () => undefined;
  registerCapture(handle, () => window);

  const request = electron.setPermissionRequestHandler.mock.lastCall?.[0];
  const check = electron.setPermissionCheckHandler.mock.lastCall?.[0];
  const allowed = vi.fn();
  request(contents, 'fullscreen', allowed);
  expect(allowed).toHaveBeenCalledWith(true);
  expect(check(contents, 'fullscreen')).toBe(true);

  const denied = vi.fn();
  request({ id: 2 }, 'fullscreen', denied);
  expect(denied).toHaveBeenCalledWith(false);
  expect(check(contents, 'notifications')).toBe(false);
});

it('lets the app window write the notes to the clipboard, never read it', () => {
  const contents = { id: 1 };
  const window = { webContents: contents } as unknown as BrowserWindow;
  registerCapture(
    () => undefined,
    () => window,
  );

  const check = electron.setPermissionCheckHandler.mock.lastCall?.[0];
  expect(check(contents, 'clipboard-sanitized-write')).toBe(true);
  expect(check(contents, 'clipboard-read')).toBe(false);
  expect(check({ id: 2 }, 'clipboard-sanitized-write')).toBe(false);
});
