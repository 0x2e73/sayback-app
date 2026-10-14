import { expect, it, vi } from 'vitest';
import type { DesktopApi } from '../shared/contracts';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn<(key: string, api: DesktopApi) => void>(),
  listeners: new Map<string, (event: unknown, value: unknown) => void>(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: vi.fn(),
    on: (channel: string, listener: (event: unknown, value: unknown) => void) => {
      electron.listeners.set(channel, listener);
    },
    removeListener: (channel: string) => {
      electron.listeners.delete(channel);
    },
  },
}));

import './index';

it('passes full-screen changes to the page, ignoring anything but a boolean', () => {
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  if (!api) throw new Error('the preload exposed nothing');
  const seen: boolean[] = [];
  const stop = api.onFullScreenChange((fullScreen) => {
    seen.push(fullScreen);
  });
  const relay = electron.listeners.get('window:full-screen-changed');
  relay?.({}, true);
  relay?.({}, 'true');
  relay?.({}, 1);
  relay?.({}, false);
  expect(seen).toEqual([true, false]);
  stop();
  expect(electron.listeners.has('window:full-screen-changed')).toBe(false);
});
