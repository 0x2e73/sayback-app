import { expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { RegisterHandler } from './ipc';

const electron = vi.hoisted(() => ({
  getMediaAccessStatus: vi.fn<(kind: string) => string>(() => 'denied'),
  getSources: vi.fn(async () => [
    {
      id: 'screen:1:0',
      display_id: '1',
      name: 'Entire Screen',
      thumbnail: { toDataURL: (): string => 'data:image/png;base64,test' },
    },
  ]),
  setPermissionRequestHandler: vi.fn(),
  setPermissionCheckHandler: vi.fn(),
  setDisplayMediaRequestHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
  desktopCapturer: { getSources: electron.getSources },
  screen: { getPrimaryDisplay: () => ({ id: 1 }) },
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
      name: 'Écran 1',
      thumbnail: 'data:image/png;base64,test',
      primary: true,
    },
  ]);
});

const picture = { toDataURL: (): string => 'data:image/png;base64,test' };

function registered(ownWindows?: Parameters<typeof registerCapture>[2]) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle: RegisterHandler = (channel, action) => {
    handlers.set(channel, action);
  };
  registerCapture(handle, () => null, ownWindows);
  return (channel: string, ...args: unknown[]) => handlers.get(channel)?.(...args);
}

it('leaves the windows of SayBack, main and island, out of the list', async () => {
  electron.getSources.mockResolvedValueOnce([
    { id: 'screen:1:0', display_id: '1', name: 'Entire Screen', thumbnail: picture },
    { id: 'window:11:0', display_id: '', name: 'SayBack', thumbnail: picture },
    { id: 'window:12:0', display_id: '', name: 'Island', thumbnail: picture },
    { id: 'window:13:0', display_id: '', name: 'Zoom', thumbnail: picture },
  ]);
  const call = registered(() => [
    { getMediaSourceId: () => 'window:11:0', isDestroyed: () => false },
    { getMediaSourceId: () => 'window:12:0', isDestroyed: () => false },
    null,
    {
      getMediaSourceId: () => {
        throw new Error('destroyed');
      },
      isDestroyed: () => true,
    },
  ]);
  const sources = (await call('capture:sources')) as { id: string }[];
  expect(sources.map((source) => source.id)).toEqual(['screen:1:0', 'window:13:0']);
});

it('numbers the screens and marks the main one', async () => {
  electron.getSources.mockResolvedValueOnce([
    { id: 'screen:2:0', display_id: '2', name: 'Screen 2', thumbnail: picture },
    { id: 'screen:1:0', display_id: '1', name: 'Screen 1', thumbnail: picture },
  ]);
  const sources = (await registered()('capture:sources')) as {
    name: string;
    primary?: boolean;
  }[];
  expect(sources.map(({ name, primary }) => [name, primary])).toEqual([
    ['Écran 1', undefined],
    ['Écran 2', true],
  ]);
});

it('keeps a window under the name the system gives it', async () => {
  electron.getSources.mockResolvedValueOnce([
    { id: 'screen:1:0', display_id: '1', name: 'Entire Screen', thumbnail: picture },
    { id: 'window:13:0', display_id: '', name: 'Zoom', thumbnail: picture },
  ]);
  const sources = (await registered()('capture:sources')) as { name: string }[];
  expect(sources.map((source) => source.name)).toEqual(['Écran 1', 'Zoom']);
});

it.each([
  ['granted', 'granted'],
  ['denied', 'denied'],
  ['restricted', 'denied'],
  ['not-determined', 'not-determined'],
  ['unknown', 'not-determined'],
])('reports the %s status of macOS as %s', (status, expected) => {
  electron.getMediaAccessStatus.mockReturnValueOnce(status);
  const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
  try {
    expect(registered()('capture:permission', 'screen')).toBe(expected);
    expect(electron.getMediaAccessStatus).toHaveBeenLastCalledWith('screen');
  } finally {
    platform.mockRestore();
  }
});

it('asks macOS about the microphone too', () => {
  electron.getMediaAccessStatus.mockReturnValueOnce('granted');
  const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
  try {
    expect(registered()('capture:permission', 'microphone')).toBe('granted');
    expect(electron.getMediaAccessStatus).toHaveBeenLastCalledWith('microphone');
  } finally {
    platform.mockRestore();
  }
});

it('does not gate a platform that has no such right', () => {
  const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
  try {
    expect(registered()('capture:permission', 'screen')).toBe('granted');
  } finally {
    platform.mockRestore();
  }
});

it.each(['camera', '', null, 4])('refuses to read the right named %j', (kind) => {
  expect(() => registered()('capture:permission', kind)).toThrow();
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
