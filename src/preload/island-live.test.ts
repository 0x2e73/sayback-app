import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IslandApi } from '../shared/contracts';
import type { IslandLiveSnapshot, LiveSegment } from '../shared/live';

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
  const exposed = electron.exposeInMainWorld.mock.calls[0]?.[1];
  if (!exposed) throw new Error('the island preload exposed nothing');
  api = exposed;
});

const segment: LiveSegment = {
  id: 'microphone-0',
  track: 'microphone',
  text: 'Bonjour',
  start: 0,
  end: 1.2,
  final: false,
  revision: 0,
};
const enabled: IslandLiveSnapshot = {
  enabled: true,
  availability: { state: 'unavailable', reason: 'port-conflict' },
  segments: [segment],
};

function emit(channel: string, value: unknown) {
  electron.listeners.get(channel)?.({}, value);
}

describe('island live preload', () => {
  it('asks the main process for the live snapshot on its own channel', async () => {
    await api.liveSnapshot();

    expect(electron.invoke).toHaveBeenCalledWith('island:live-snapshot');
  });

  it('passes on a well-formed snapshot, on or off, and drops the rest', () => {
    const seen: IslandLiveSnapshot[] = [];
    const stop = api.onLive((snapshot) => seen.push(snapshot));

    emit('island:live', enabled);
    emit('island:live', { enabled: false });
    emit('island:live', { enabled: true, availability: { state: 'ready' }, segments: 'x' });
    emit('island:live', { enabled: true, availability: { state: 'lost' }, segments: [] });
    emit('island:live', { enabled: true, segments: [] });
    emit('island:live', null);
    stop();
    emit('island:live', { enabled: false });

    expect(seen).toEqual([enabled, { enabled: false }]);
  });

  it('passes on a well-formed segment and drops a malformed one', () => {
    const seen: LiveSegment[] = [];
    api.onLiveSegment((next) => seen.push(next));

    emit('island:live-segment', segment);
    emit('island:live-segment', { ...segment, track: 'speaker' });
    emit('island:live-segment', { ...segment, start: Number.NaN });
    emit('island:live-segment', { ...segment, revision: 0.5 });
    emit('island:live-segment', { ...segment, text: 3 });
    emit('island:live-segment', 'Bonjour');

    expect(seen).toEqual([segment]);
  });
});
