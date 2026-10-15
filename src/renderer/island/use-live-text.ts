import { useEffect, useReducer } from 'react';
import type { IslandApi } from '../../shared/contracts';
import type { IslandLiveSnapshot } from '../../shared/live';
import { applyLive } from './live-text';

/**
 * The live text as the main process sends it: listening first, then the snapshot, which an
 * `onLive` received meanwhile makes stale. Null until the first one arrives.
 */
export function useLiveText(
  api: Pick<IslandApi, 'liveSnapshot' | 'onLive' | 'onLiveSegment'>,
): IslandLiveSnapshot | null {
  const [live, dispatch] = useReducer(applyLive, null);
  useEffect(() => {
    let mounted = true;
    let replaced = false;
    const stopLive = api.onLive((snapshot) => {
      replaced = true;
      dispatch({ kind: 'replace', snapshot });
    });
    const stopSegment = api.onLiveSegment((segment) => dispatch({ kind: 'segment', segment }));
    api
      .liveSnapshot()
      .then((result) => {
        if (mounted && result.ok && !replaced)
          dispatch({ kind: 'replace', snapshot: result.value });
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      stopLive();
      stopSegment();
    };
  }, [api]);
  return live;
}
