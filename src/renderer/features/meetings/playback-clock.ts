import { useSyncExternalStore } from 'react';

/** The playback position, outside React: only what reads it re-renders when it moves. */
export interface PlaybackClock {
  now(): number;
  set(at: number): void;
  subscribe(listener: () => void): () => void;
}

export function createPlaybackClock(start = 0): PlaybackClock {
  let at = start;
  const listeners = new Set<() => void>();
  return {
    now: () => at,
    set(next) {
      if (next === at) return;
      at = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function usePlaybackTime(clock: PlaybackClock): number {
  return useSyncExternalStore(clock.subscribe, clock.now);
}

/** Re-renders only when the selected value changes: the transcript selects its active turn. */
export function usePlaybackSelector<T>(clock: PlaybackClock, select: (at: number) => T): T {
  return useSyncExternalStore(clock.subscribe, () => select(clock.now()));
}
