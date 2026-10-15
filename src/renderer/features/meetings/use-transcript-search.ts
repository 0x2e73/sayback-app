import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Turn } from './speaker-turns';
import {
  counterLabel,
  keptMatch,
  matchKey,
  searchTranscript,
  stepMatch,
  type SearchResult,
} from './transcript-search';
import type { TranscriptView } from './use-detail-view';

export interface FoundMatches {
  query: string;
  result: SearchResult;
  current: number;
  currentKey: string | null;
  /** Changes when the reader moves to a result (a settled query, a step), never on a poll. */
  reveal: string;
  label: string;
  setQuery(value: string): void;
  step(direction: 1 | -1): void;
}

type SearchState = Pick<TranscriptView, 'search' | 'onSearch' | 'match' | 'onMatch'>;

export function useTranscriptSearch(turns: readonly Turn[], state: SearchState): FoundMatches {
  const { search: query, match: chosen } = state;
  // Typing stays responsive on a long transcript: the highlights follow a beat behind.
  const deferred = useDeferredValue(query);
  const result = useMemo(() => searchTranscript(turns, deferred), [turns, deferred]);
  const [steps, setSteps] = useState(0);
  // What was last shown: text arriving before it during an analysis must not move it.
  const shown = useRef<string | null>(null);
  const seenQuery = useRef(deferred);
  // A query that has just settled starts again from its first match.
  const kept = deferred === seenQuery.current ? shown.current : null;
  const current = keptMatch(result.matches, chosen ?? kept, turns);
  const match = result.matches[current];
  const currentKey = match ? matchKey(match) : null;
  // After every commit: the key may stay the same while the query changed.
  useEffect(() => {
    seenQuery.current = deferred;
    shown.current = currentKey;
  });

  return {
    query,
    result,
    current,
    currentKey,
    reveal: `${deferred}\u0000${steps}`,
    label: result.needle ? counterLabel(current, result.matches.length, result.capped) : '',
    setQuery: state.onSearch,
    step(direction) {
      const next = result.matches[stepMatch(current, result.matches.length, direction)];
      if (!next) return;
      state.onMatch(matchKey(next));
      setSteps((count) => count + 1);
    },
  };
}
