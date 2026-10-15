import { useCallback, useEffect, useState } from 'react';
import { chronoLabel } from '../../shared/format';
import type { IslandApi } from '../../shared/contracts';
import type { IslandRequest, IslandSnapshot } from '../../shared/island';
import { elapsedAt, type RecordingState } from '../../shared/recording-state';

export type Clock = () => number;

export const monotonic: Clock = () => performance.now();

export interface IslandView {
  snapshot: IslandSnapshot;
  /** When this page received the snapshot, on its own monotonic clock. */
  receivedAt: number;
  expanded: boolean;
}

/** What the main process says, from the first snapshot to every later change. */
export function useIsland(api: IslandApi, now: Clock) {
  const [received, setReceived] = useState<{ snapshot: IslandSnapshot; receivedAt: number }>();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    const take = (snapshot: IslandSnapshot) => {
      setReceived({ snapshot, receivedAt: now() });
      setExpanded(snapshot.expanded);
    };
    const stopState = api.onState(take);
    const stopExpanded = api.onExpanded(setExpanded);
    void api
      .ready()
      .then((result) => {
        if (mounted && result.ok) take(result.value);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      stopState();
      stopExpanded();
    };
  }, [api, now]);

  const request = useCallback(
    (wanted: IslandRequest) => void api.request(wanted).catch(() => undefined),
    [api],
  );
  const view: IslandView | null = received ? { ...received, expanded } : null;
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
