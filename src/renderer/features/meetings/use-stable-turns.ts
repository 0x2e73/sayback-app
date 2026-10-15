import { useMemo, useRef } from 'react';
import type { Segment } from '../../../shared/contracts';
import { speakerTurns, type Turn } from './speaker-turns';
import { stableTurns } from './transcript-rows';

/** The 2 s poll hands over equal segments in new objects: unchanged turns keep their identity. */
export function useStableTurns(transcript: readonly Segment[]): readonly Turn[] {
  const previous = useRef<readonly Turn[]>([]);
  return useMemo(() => {
    const next = stableTurns(previous.current, speakerTurns(transcript));
    previous.current = next;
    return next;
  }, [transcript]);
}
