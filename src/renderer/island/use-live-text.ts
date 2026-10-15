import { useEffect, useReducer } from 'react';
import type { IslandApi } from '../../shared/contracts';
import type { IslandLiveSnapshot } from '../../shared/live';
import { applyLive } from './live-text';

type LiveApi = Pick<IslandApi, 'liveSnapshot' | 'onLive' | 'onLiveSegment'>;

/**
 * Asks for the snapshot until one lands: a failure is retried once, and the first segment that
 * arrives while it is still missing asks again. An `onLive` received meanwhile wins.
 */
function snapshotLoader(api: LiveApi, land: (snapshot: IslandLiveSnapshot) => void) {
  let loaded = false;
  let loading = false;
  let retried = false;
  let askedOnSegment = false;
  let stopped = false;

  function load(): void {
    if (loaded || loading || stopped) return;
    loading = true;
    api
      .liveSnapshot()
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        return result.value;
      })
      .then(
        (snapshot) => {
          loading = false;
          if (!stopped && !loaded) land(snapshot);
          loaded = true;
        },
        () => {
          loading = false;
          if (retried) return;
          retried = true;
          load();
        },
      );
  }

  return {
    load,
    replaced: () => {
      loaded = true;
    },
    // A load in flight may still land: the one re-ask is kept for when it has failed.
    segmentArrived: () => {
      if (loaded || loading || askedOnSegment) return;
      askedOnSegment = true;
      load();
    },
    stop: () => {
      stopped = true;
    },
  };
}

/** The live text as the main process sends it; null until the first snapshot arrives. */
export function useLiveText(api: LiveApi): IslandLiveSnapshot | null {
  const [live, dispatch] = useReducer(applyLive, null);
  useEffect(() => {
    const loader = snapshotLoader(api, (snapshot) => dispatch({ kind: 'replace', snapshot }));
    const stopLive = api.onLive((snapshot) => {
      loader.replaced();
      dispatch({ kind: 'replace', snapshot });
    });
    const stopSegment = api.onLiveSegment((segment) => {
      loader.segmentArrived();
      dispatch({ kind: 'segment', segment });
    });
    loader.load();
    return () => {
      loader.stop();
      stopLive();
      stopSegment();
    };
  }, [api]);
  return live;
}
