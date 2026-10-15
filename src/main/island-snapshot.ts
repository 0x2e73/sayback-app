import type { IslandReadyState, IslandScreen, IslandShape, IslandSnapshot } from '../shared/island';
import type { RecordingStateHub } from './recording-state-hub';

interface SnapshotInput {
  hub: Pick<RecordingStateHub, 'current' | 'elapsed'>;
  shape: IslandShape;
  expanded: boolean;
  /** Present on a ready island only. */
  ready: IslandReadyState | null;
  /** The screens a recording island may switch to. */
  screens: IslandScreen[];
}

/** What the island page draws, as sent on `island:ready` and `island:state`. */
export function islandSnapshot(input: SnapshotInput): IslandSnapshot {
  const { hub, shape, expanded, ready, screens } = input;
  const { state } = hub.current();
  // The elapsed time at sending: the page counts on from its own reception.
  const recording = state.recording ? { ...state, elapsed: hub.elapsed() } : state;
  const frame = { recording, expanded, shape };
  if (ready) return { ...frame, mode: 'ready', ready };
  return { ...frame, mode: 'recording', screens };
}
