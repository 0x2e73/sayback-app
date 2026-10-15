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

export interface FoundMatches {
  query: string;
  result: SearchResult;
  current: number;
  currentKey: string | null;
  label: string;
  setQuery(value: string): void;
  step(direction: 1 | -1): void;
}

export function useTranscriptSearch(
  turns: readonly Turn[],
  query: string,
  onQuery: (value: string) => void,
): FoundMatches {
  // Typing stays responsive on a long transcript: the highlights follow a beat behind.
  const deferred = useDeferredValue(query);
  const result = useMemo(() => searchTranscript(turns, deferred), [turns, deferred]);
  const [chosen, setChosen] = useState<string | null>(null);
  // The match last shown: text arriving before it during an analysis must not move it.
  const shown = useRef<string | null>(null);
  const current = keptMatch(result.matches, chosen ?? shown.current);
  const match = result.matches[current];
  const currentKey = match ? matchKey(match) : null;
  // After every commit: a keystroke resets the ref while the key may stay the same.
  useEffect(() => {
    shown.current = currentKey;
  });

  return {
    query,
    result,
    current,
    currentKey,
    label: result.needle ? counterLabel(current, result.matches.length, result.capped) : '',
    setQuery(value) {
      shown.current = null;
      setChosen(null);
      onQuery(value);
    },
    step(direction) {
      const next = result.matches[stepMatch(current, result.matches.length, direction)];
      if (next) setChosen(matchKey(next));
    },
  };
}
