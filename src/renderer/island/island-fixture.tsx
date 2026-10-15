import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import type { IslandApi } from '../../shared/contracts';
import type { IslandReadyState, IslandSnapshot } from '../../shared/island';
import type { RecordingStartOutcome } from '../../shared/recording-start';
import type { RecordingState } from '../../shared/recording-state';
import { IslandApp } from './IslandApp';

export const shape: IslandSnapshot['shape'] = {
  kind: 'notch',
  barHeight: 38,
  notchWidth: 220,
  compactWidth: 388,
  openWidth: 560,
  openHeight: 240,
};

export const recording = (extra: Partial<RecordingState> = {}): RecordingState =>
  ({ recording: true, elapsed: 12, paused: false, stopping: false, ...extra }) as RecordingState;

export const readyState = (extra: Partial<IslandReadyState> = {}): IslandReadyState => ({
  title: 'Réunion du 15 octobre, 11 h 00',
  remembered: { microphone: true, systemAudio: true, screen: true },
  screen: { id: 'screen:1:0', name: 'Écran 1' },
  screenCount: 2,
  error: null,
  ...extra,
});

export const readySnapshot = (extra: Partial<IslandReadyState> = {}): IslandSnapshot => ({
  mode: 'ready',
  recording: { recording: false },
  expanded: true,
  shape,
  ready: readyState(extra),
});

interface Listeners {
  state(snapshot: IslandSnapshot): void;
  expanded(expanded: boolean): void;
  level: Set<(level: number) => void>;
  startResult(outcome: RecordingStartOutcome): void;
}

export function fakeIsland(first: IslandSnapshot) {
  const listeners: Listeners = {
    state: () => {},
    expanded: () => {},
    level: new Set(),
    startResult: () => {},
  };
  const request = vi.fn<IslandApi['request']>(async () => ({ ok: true, value: undefined }));
  const api: IslandApi = {
    ready: async () => ({ ok: true, value: first }),
    request,
    onState: (listener) => {
      listeners.state = listener;
      return () => {};
    },
    onExpanded: (listener) => {
      listeners.expanded = listener;
      return () => {};
    },
    onLevel: (listener) => {
      listeners.level.add(listener);
      return () => listeners.level.delete(listener);
    },
    onStartResult: (listener) => {
      listeners.startResult = listener;
      return () => {};
    },
    liveSnapshot: async () => ({ ok: true, value: { enabled: false } }),
    onLive: () => () => {},
    onLiveSegment: () => () => {},
  };
  return {
    api,
    request,
    push: (snapshot: IslandSnapshot) => act(() => listeners.state(snapshot)),
    expand: (expanded: boolean) => act(() => listeners.expanded(expanded)),
    level: (value: number) => act(() => listeners.level.forEach((listener) => listener(value))),
    result: (outcome: RecordingStartOutcome) => act(() => listeners.startResult(outcome)),
  };
}

export async function shown(snapshot: IslandSnapshot) {
  const island = fakeIsland(snapshot);
  render(<IslandApp api={island.api} now={() => Date.now()} />);
  await act(async () => {});
  return island;
}

/** Shown, then past the frame on which a ready island opens. */
export async function opened(snapshot: IslandSnapshot) {
  const island = await shown(snapshot);
  await act(async () => vi.advanceTimersByTime(50));
  return island;
}
