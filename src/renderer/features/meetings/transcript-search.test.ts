import { describe, expect, it } from 'vitest';
import type { Segment } from '../../../shared/contracts';
import { speakerTurns } from './speaker-turns';
import {
  counterLabel,
  keptMatch,
  matchKey,
  searchTranscript,
  stepMatch,
} from './transcript-search';

const voices = (texts: string[]) =>
  speakerTurns(
    texts.map((text, index): Segment => ({
      id: `0-${index}`,
      start: index,
      end: index + 1,
      text,
      speaker: index % 2 ? 'B' : 'A',
    })),
  );

const turns = voices(['Le budget est validé.', 'Budget 2027 : le BUDGET reste.', 'Rien à voir.']);

describe('searchTranscript', () => {
  it('finds every match in reading order, case and accents ignored', () => {
    const result = searchTranscript(turns, 'budget');
    expect(result.matches).toEqual([
      { turnId: '0-0', start: 3, end: 9 },
      { turnId: '0-1', start: 0, end: 6 },
      { turnId: '0-1', start: 17, end: 23 },
    ]);
    expect(result.capped).toBe(false);
    expect(searchTranscript(turns, 'VALIDE').matches).toEqual([
      { turnId: '0-0', start: 14, end: 20 },
    ]);
  });

  it('ignores a blank query', () => {
    expect(searchTranscript(turns, '   ')).toEqual({
      needle: '',
      matches: [],
      byTurn: new Map(),
      capped: false,
    });
  });

  it('finds nothing for an absent word', () => {
    expect(searchTranscript(turns, 'absent').matches).toEqual([]);
  });

  it('stops at 500 matches and says so', () => {
    const result = searchTranscript(voices(['a '.repeat(600), 'a']), 'a');
    expect(result.matches).toHaveLength(500);
    expect(result.capped).toBe(true);
    expect(result.byTurn.has('0-1')).toBe(false);
  });

  it('is not capped at exactly 500', () => {
    const result = searchTranscript(voices(['a '.repeat(499), 'a']), 'a');
    expect(result.matches).toHaveLength(500);
    expect(result.capped).toBe(false);
  });

  it('says it is capped when the 500th match ends a turn and another turn matches', () => {
    const result = searchTranscript(voices(['a '.repeat(500), 'a']), 'a');
    expect(result.matches).toHaveLength(500);
    expect(result.capped).toBe(true);
  });

  it('hands back the same ranges for an unchanged turn', () => {
    expect(searchTranscript(turns, 'budget').byTurn.get('0-1')).toBe(
      searchTranscript(turns, 'budget').byTurn.get('0-1'),
    );
  });
});

describe('stepMatch', () => {
  it.each([
    [-1, 3, 1, 0],
    [-1, 3, -1, 2],
    [0, 3, 1, 1],
    [2, 3, 1, 0],
    [0, 3, -1, 2],
    [1, 3, -1, 0],
    [0, 0, 1, -1],
  ] as const)('from %s of %s going %s lands on %s', (current, count, direction, expected) => {
    expect(stepMatch(current, count, direction)).toBe(expected);
  });
});

describe('keptMatch', () => {
  const matches = searchTranscript(turns, 'budget').matches;

  it('keeps the current match across a poll, or falls back to the first', () => {
    expect(keptMatch([], 'x', turns)).toBe(-1);
    expect(keptMatch(matches, null, turns)).toBe(0);
    expect(keptMatch(matches, '0-1:17', turns)).toBe(2);
    expect(keptMatch(matches, 'gone:1', turns)).toBe(0);
  });

  it.each([
    ['in the same turn, before the next match', '0-0:5', 1],
    ['in a turn without match any more', '0-2:0', 2],
    ['after the last match', '0-1:30', 2],
  ])('moves to the nearest match at or after a vanished one: %s', (_case, key, index) => {
    expect(keptMatch(matches, key, turns)).toBe(index);
  });

  it('keys a match by its turn and start', () => {
    expect(matches.map(matchKey)).toEqual(['0-0:3', '0-1:0', '0-1:17']);
  });
});

describe('counterLabel', () => {
  it.each([
    [2, 12, false, '3 sur 12'],
    [0, 500, true, '1 sur 500+'],
    [-1, 0, false, 'Aucun résultat'],
  ])('reads %s of %s (capped %s) as « %s »', (current, count, capped, label) => {
    expect(counterLabel(current, count, capped)).toBe(label);
  });
});
