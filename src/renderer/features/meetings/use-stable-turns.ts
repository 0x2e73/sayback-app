import { useMemo, useRef } from 'react';
import type { Segment } from '../../../shared/contracts';
import { partOf, speakerTurns, type Turn } from './speaker-turns';
import { stableTurns } from './transcript-rows';

/** Providers do not always time their segments in order: by part, then by start, ties kept. */
export function inReadingOrder(transcript: readonly Segment[]): Segment[] {
  return transcript
    .map((segment, order) => ({ segment, order, part: partOf(segment.id) ?? -1 }))
    .sort((a, b) => a.part - b.part || a.segment.start - b.segment.start || a.order - b.order)
    .map(({ segment }) => segment);
}

/** The 2 s poll hands over equal segments in new objects: unchanged turns keep their identity. */
export function useStableTurns(transcript: readonly Segment[]): readonly Turn[] {
  const previous = useRef<readonly Turn[]>([]);
  return useMemo(() => {
    const next = stableTurns(previous.current, speakerTurns(inReadingOrder(transcript)));
    previous.current = next;
    return next;
  }, [transcript]);
}
