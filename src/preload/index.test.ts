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

import { ipcRenderer } from 'electron';
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

it.each([
  ['onMenuBarNewRecording', 'menu-bar:new-recording'],
  ['onMenuBarStopRecording', 'menu-bar:stop-recording'],
] as const)('relays %s to the page until it unsubscribes', (method, channel) => {
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  if (!api) throw new Error('the preload exposed nothing');
  let count = 0;
  const stop = api[method](() => {
    count += 1;
  });
  electron.listeners.get(channel)?.({}, undefined);
  electron.listeners.get(channel)?.({}, 'anything');
  expect(count).toBe(2);
  stop();
  expect(electron.listeners.has(channel)).toBe(false);
});

it('sends the chosen appearance on its own channel', async () => {
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  if (!api) throw new Error('the preload exposed nothing');
  await api.setAppearance('light');
  expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:set-appearance', 'light');
});
