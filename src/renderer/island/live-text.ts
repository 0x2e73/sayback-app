import type { IslandLiveSnapshot, LiveSegment, LiveTrack } from '../../shared/live';

export type LiveAction =
  { kind: 'replace'; snapshot: IslandLiveSnapshot } | { kind: 'segment'; segment: LiveSegment };

/**
 * One utterance, new or revised: a higher revision replaces the segment of the same id, an
 * empty final removes it, a lower or equal revision changes nothing.
 */
export function upsertSegment(segments: LiveSegment[], segment: LiveSegment): LiveSegment[] {
  const index = segments.findIndex((item) => item.id === segment.id);
  const existing = segments[index];
  if (existing && existing.revision >= segment.revision) return segments;
  if (segment.final && segment.text.trim() === '') {
    return segments.filter((item) => item.id !== segment.id);
  }
  if (!existing) return [...segments, segment];
  return segments.map((item) => (item.id === segment.id ? segment : item));
}

/**
 * `onLive` replaces everything; a segment before the first snapshot, or with the text turned
 * off, is dropped: the snapshot that follows carries it.
 */
export function applyLive(
  state: IslandLiveSnapshot | null,
  action: LiveAction,
): IslandLiveSnapshot | null {
  if (action.kind === 'replace') return action.snapshot;
  if (!state?.enabled) return state;
  const segments = upsertSegment(state.segments, action.segment);
  return segments === state.segments ? state : { ...state, segments };
}

/** Consecutive words of one track: « Toi » or « Les autres ». */
export interface LiveTurn {
  key: string;
  track: LiveTrack;
  text: string;
}

/** The latest turns, oldest first: the island shows the end of the last ones. */
export const LIVE_TURNS = 4;

export function liveTurns(segments: readonly LiveSegment[], count = LIVE_TURNS): LiveTurn[] {
  const spoken = segments
    .filter((segment) => segment.text.trim() !== '')
    .toSorted((a, b) => a.start - b.start);
  const turns: LiveTurn[] = [];
  for (const segment of spoken) {
    const last = turns.at(-1);
    if (last?.track === segment.track) last.text = `${last.text} ${segment.text.trim()}`;
    else turns.push({ key: segment.id, track: segment.track, text: segment.text.trim() });
  }
  return turns.slice(-count);
}
