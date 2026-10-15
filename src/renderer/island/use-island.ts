import { useCallback, useEffect, useState } from 'react';
import { chronoLabel } from '../../shared/format';
import type { IslandApi } from '../../shared/contracts';
import type { IslandReadyState, IslandRequest, IslandSnapshot } from '../../shared/island';
import { elapsedAt, type RecordingState } from '../../shared/recording-state';
import { afterNextPaint } from './next-paint';

export type Clock = () => number;

export const monotonic: Clock = () => performance.now();

export interface IslandView {
  snapshot: IslandSnapshot;
  /** When this page received the snapshot, on its own monotonic clock. */
  receivedAt: number;
  expanded: boolean;
  /** The last ready state of this window: it opened ready, and hands over once recording. */
  ready: IslandReadyState | null;
}

interface Received {
  snapshot: IslandSnapshot;
  receivedAt: number;
}

/** What the main process says, from the first snapshot to every later change. */
export function useIsland(api: IslandApi, now: Clock) {
  const [received, setReceived] = useState<Received>();
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState<IslandReadyState | null>(null);

  useEffect(() => {
    let mounted = true;
    let opened = false;
    // The ready island is drawn compact first: the shell grows when it opens on the next frame.
    let entrance: (() => void) | null = null;
    const settle = (next: boolean) => {
      entrance?.();
      entrance = null;
      setExpanded(next);
    };
    const take = (snapshot: IslandSnapshot) => {
      setReceived({ snapshot, receivedAt: now() });
      if (snapshot.mode === 'ready') setReady(snapshot.ready);
      if (snapshot.mode === 'ready' && !opened) {
        opened = true;
        setExpanded(false);
        entrance = afterNextPaint(() => settle(snapshot.expanded));
        return;
      }
      if (!entrance) setExpanded(snapshot.expanded);
    };
    const stopState = api.onState(take);
    const stopExpanded = api.onExpanded(settle);
    void api
      .ready()
      .then((result) => {
        if (mounted && result.ok) take(result.value);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      entrance?.();
      stopState();
      stopExpanded();
    };
  }, [api, now]);

  const request = useCallback(
    (wanted: IslandRequest) => void api.request(wanted).catch(() => undefined),
    [api],
  );
  const view: IslandView | null = received ? { ...received, expanded, ready } : null;
  return { view, request };
}

/** The chrono counts by itself from the last state; it never animates. */
export function useChrono(state: RecordingState, receivedAt: number, now: Clock): string {
  const running = state.recording && !state.paused && !state.stopping;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 250);
    return () => clearInterval(timer);
  }, [running]);
  return chronoLabel(elapsedAt(state, receivedAt, now()));
}
