import type { IslandReadyState, IslandShape, IslandSnapshot } from '../shared/island';
import type { RecordingStateHub } from './recording-state-hub';

interface SnapshotInput {
  hub: Pick<RecordingStateHub, 'current' | 'elapsed'>;
  shape: IslandShape;
  expanded: boolean;
  /** Present on a ready island only. */
  ready: IslandReadyState | null;
}

/** What the island page draws, as sent on `island:ready` and `island:state`. */
export function islandSnapshot({ hub, shape, expanded, ready }: SnapshotInput): IslandSnapshot {
  const { state } = hub.current();
  // The elapsed time at sending: the page counts on from its own reception.
  const recording = state.recording ? { ...state, elapsed: hub.elapsed() } : state;
  const frame = { recording, expanded, shape };
  if (ready) return { ...frame, mode: 'ready', ready };
  return { ...frame, mode: 'recording' };
}
