import {
  findMatches,
  foldText,
  normalizeSearch,
  type FoldedText,
  type TextRange,
} from '../../search-text';
import type { Turn } from './speaker-turns';

export const MATCH_LIMIT = 500;

export interface TranscriptMatch extends TextRange {
  turnId: string;
}

export interface SearchResult {
  needle: string;
  matches: TranscriptMatch[];
  byTurn: ReadonlyMap<string, readonly TextRange[]>;
  capped: boolean;
}

// Turns keep their object across polls (stableTurns): fold and search each one once.
const folded = new WeakMap<Turn, FoldedText>();
const found = new WeakMap<Turn, { needle: string; ranges: readonly TextRange[] }>();

function foldedTurn(turn: Turn): FoldedText {
  const cached = folded.get(turn);
  if (cached) return cached;
  const text = foldText(turn.text);
  folded.set(turn, text);
  return text;
}

function rangesIn(turn: Turn, needle: string): readonly TextRange[] {
  const cached = found.get(turn);
  if (cached?.needle === needle) return cached.ranges;
  const ranges = findMatches(foldedTurn(turn), needle, MATCH_LIMIT + 1);
  found.set(turn, { needle, ranges });
  return ranges;
}

export function searchTranscript(turns: readonly Turn[], query: string): SearchResult {
  const needle = normalizeSearch(query);
  const matches: TranscriptMatch[] = [];
  const byTurn = new Map<string, readonly TextRange[]>();
  const done = (capped: boolean): SearchResult => ({ needle, matches, byTurn, capped });
  if (!needle) return done(false);
  for (const turn of turns) {
    const ranges = rangesIn(turn, needle);
    if (!ranges.length) continue;
    const room = MATCH_LIMIT - matches.length;
    if (room <= 0) return done(true);
    const kept = ranges.length > room ? ranges.slice(0, room) : ranges;
    byTurn.set(turn.id, kept);
    for (const range of kept) matches.push({ turnId: turn.id, ...range });
    if (kept.length < ranges.length) return done(true);
  }
  return done(false);
}

export function stepMatch(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}

export function matchKey(match: TranscriptMatch): string {
  return `${match.turnId}:${match.start}`;
}

/** After a poll the same passage stays current; one that vanished gives way to the first. */
export function keptMatch(matches: readonly TranscriptMatch[], key: string | null): number {
  if (!matches.length) return -1;
  if (key === null) return 0;
  const index = matches.findIndex((match) => matchKey(match) === key);
  return index >= 0 ? index : 0;
}

export function counterLabel(current: number, count: number, capped: boolean): string {
  if (count === 0) return 'Aucun résultat';
  return `${current + 1} sur ${count}${capped ? '+' : ''}`;
}
