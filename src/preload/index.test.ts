import { expect, it, vi } from 'vitest';
import type { DesktopApi } from '../shared/contracts';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn<(key: string, api: DesktopApi) => void>(),
  listeners: new Map<string, (event: unknown, value: unknown) => void>(),
  send: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: vi.fn(),
    send: electron.send,
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

it('relays the menu bar new recording to the page until it unsubscribes', () => {
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  if (!api) throw new Error('the preload exposed nothing');
  let count = 0;
  const stop = api.onMenuBarNewRecording(() => {
    count += 1;
  });
  electron.listeners.get('menu-bar:new-recording')?.({}, undefined);
  electron.listeners.get('menu-bar:new-recording')?.({}, 'anything');
  expect(count).toBe(2);
  stop();
  expect(electron.listeners.has('menu-bar:new-recording')).toBe(false);
});

it('passes pause, resume and stop requests to the page, ignoring anything else', () => {
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  if (!api) throw new Error('the preload exposed nothing');
  const seen: string[] = [];
  const stop = api.onRecordingRequest((request) => seen.push(request));
  const relay = electron.listeners.get('recording:request');
  for (const value of ['pause', 'open', 'resume', 1, null, { request: 'stop' }, 'stop']) {
    relay?.({}, value);
  }
  expect(seen).toEqual(['pause', 'resume', 'stop']);
  stop();
  expect(electron.listeners.has('recording:request')).toBe(false);
});

it('passes a well-formed start request to the page, and sends its answer back', async () => {
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  if (!api) throw new Error('the preload exposed nothing');
  const request = {
    id: 'a1',
    title: 'Réunion',
    selection: { microphone: true, systemAudio: false, screen: false },
  };
  const seen: unknown[] = [];
  const stop = api.onStartRequest((received) => seen.push(received));
  const relay = electron.listeners.get('recording:start-request');
  for (const value of [request, null, { ...request, id: 3 }, { ...request, selection: {} }]) {
    relay?.({}, value);
  }
  expect(seen).toEqual([request]);
  stop();
  expect(electron.listeners.has('recording:start-request')).toBe(false);
  await api.answerStartRequest('a1', { ok: false, error: 'no-screen' });
  expect(ipcRenderer.invoke).toHaveBeenCalledWith('recording:start-result', {
    id: 'a1',
    outcome: { ok: false, error: 'no-screen' },
  });
});

it('sends the chosen appearance on its own channel', async () => {
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  if (!api) throw new Error('the preload exposed nothing');
  await api.setAppearance('light');
  expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:set-appearance', 'light');
});

it('sends the audio level to the main process without waiting for an answer', () => {
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  if (!api) throw new Error('the preload exposed nothing');
  api.sendLevel(0.25);
  api.sendLevel(Number.NaN);
  api.sendLevel(Infinity);
  api.sendLevel('0.5' as unknown as number);
  expect(electron.send.mock.calls).toEqual([['live:level', 0.25]]);
});
