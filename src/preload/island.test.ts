import { beforeAll, expect, it, vi } from 'vitest';
import type { IslandApi } from '../shared/contracts';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn<(key: string, api: IslandApi) => void>(),
  invoke: vi.fn(),
  listeners: new Map<string, (event: unknown, value: unknown) => void>(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: (channel: string, listener: (event: unknown, value: unknown) => void) => {
      electron.listeners.set(channel, listener);
    },
    removeListener: (channel: string) => {
      electron.listeners.delete(channel);
    },
  },
}));

let api: IslandApi;
beforeAll(async () => {
  await import('./island');
  const [key, exposed] = electron.exposeInMainWorld.mock.calls[0] ?? [];
  if (key !== 'sayBackIsland' || !exposed) throw new Error('the island preload exposed nothing');
  api = exposed;
});

const snapshot = {
  recording: { recording: true, elapsed: 3, paused: false, stopping: false },
  expanded: false,
  shape: { kind: 'notch' },
};

it('exposes only the two island channels to call', () => {
  void api.ready();
  void api.request('pause');
  expect(electron.invoke.mock.calls).toEqual([['island:ready'], ['island:request', 'pause']]);
  expect(Object.keys(api).sort()).toEqual(['onExpanded', 'onLevel', 'onState', 'ready', 'request']);
});

function relayed<T>(
  subscribe: (listener: (value: T) => void) => () => void,
  channel: string,
  sent: unknown[],
): T[] {
  const seen: T[] = [];
  const stop = subscribe((value) => seen.push(value));
  for (const value of sent) electron.listeners.get(channel)?.({}, value);
  stop();
  expect(electron.listeners.has(channel)).toBe(false);
  return seen;
}

it('passes a state snapshot, ignoring malformed ones, until it unsubscribes', () => {
  const sent = [snapshot, null, 'state', { recording: {}, shape: {} }];
  expect(relayed(api.onState, 'island:state', sent)).toEqual([snapshot]);
});

it('passes the opening and closing, ignoring anything but a boolean', () => {
  const sent = [true, 'true', 1, false];
  expect(relayed(api.onExpanded, 'island:expanded', sent)).toEqual([true, false]);
});

it('passes a level between 0 and 1 only', () => {
  const sent = [0.4, -1, 2, Number.NaN, '0.5', 1];
  expect(relayed(api.onLevel, 'island:level', sent)).toEqual([0.4, 1]);
});
