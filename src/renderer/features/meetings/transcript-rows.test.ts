import { describe, expect, it } from 'vitest';
import type { Segment } from '../../../shared/contracts';
import { speakerTurns } from './speaker-turns';
import {
  activeTurnIndex,
  followedTurnIndex,
  lastStartedIndex,
  partStarts,
  passageTurn,
  runningMaxEnd,
  stableTurns,
  transcriptRows,
  type TranscriptRow,
} from './transcript-rows';

const summary = (rows: TranscriptRow[]) =>
  rows.map((row) =>
    row.kind === 'part'
      ? ['part', row.part, row.start, row.first]
      : ['turn', row.turn.id, row.tone, row.labelled],
  );

const starts = new Map([
  [0, 0],
  [1, 600],
  [2, 1200],
]);

describe('transcriptRows', () => {
  it('marks each change of part, the first one with the sentence, and restarts the colours', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
      { id: '0-1', start: 4, end: 6, text: 'Salut.', speaker: 'B' },
      { id: '0-2', start: 6, end: 9, text: 'On commence.', speaker: 'A' },
      { id: '1-0', start: 601, end: 604, text: 'Encore moi.', speaker: 'B' },
      { id: '1-1', start: 604, end: 605, text: 'Oui.', speaker: 'A' },
      { id: '2-0', start: 1200, end: 1203, text: 'Fin.', speaker: 'A' },
    ]);
    expect(summary(transcriptRows(turns, starts))).toEqual([
      ['turn', '0-0', 1, true],
      ['turn', '0-1', 2, true],
      ['turn', '0-2', 1, true],
      ['part', 2, 600, true],
      ['turn', '1-0', 1, true],
      ['turn', '1-1', 2, true],
      ['part', 3, 1200, false],
      ['turn', '2-0', 1, true],
    ]);
  });

  it('has neither separator nor label without any speaker', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Un.' },
      { id: '1-0', start: 60, end: 62, text: 'Deux.' },
    ]);
    expect(summary(transcriptRows(turns, new Map([[1, 60]])))).toEqual([
      ['turn', '0-0', null, false],
      ['turn', '1-0', null, false],
    ]);
  });

  it('labels a single speaker in each part and keeps the separators', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Un.', speaker: 'A' },
      { id: '1-0', start: 60, end: 62, text: 'Deux.', speaker: 'A' },
    ]);
    expect(summary(transcriptRows(turns, new Map()))).toEqual([
      ['turn', '0-0', 1, true],
      ['part', 2, 60, true],
      ['turn', '1-0', 1, true],
    ]);
  });

  it('cycles through four colours and leaves a continuation unlabelled', () => {
    const voices: Segment[] = ['A', 'B', 'C', 'D', 'E'].map((speaker, index) => ({
      id: `0-${index}`,
      start: index,
      end: index + 1,
      text: `${speaker}.`,
      speaker,
    }));
    const long: Segment[] = Array.from({ length: 10 }, (_segment, index) => ({
      id: `0-${index + 5}`,
      start: 10 + index,
      end: 11 + index,
      text: 'x'.repeat(100),
      speaker: 'E',
    }));
    const rows = transcriptRows(speakerTurns([...voices, ...long]), new Map());
    expect(summary(rows).map(([, , tone, labelled]) => [tone, labelled])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, true],
      [1, true],
      [1, false],
    ]);
  });

  it('gives nothing for an empty transcript', () => {
    expect(transcriptRows([], starts)).toEqual([]);
  });
});

describe('partStarts', () => {
  it('maps each extract to its start', () => {
    const chunk = (index: number, start: number) => ({
      index,
      start,
      duration: 60,
      transcript: null,
    });
    expect(partStarts([chunk(0, 0), chunk(1, 600)])).toEqual(
      new Map([
        [0, 0],
        [1, 600],
      ]),
    );
  });
});

describe('activeTurnIndex', () => {
  const turns = [
    { start: 1, end: 3 },
    { start: 4, end: 6 },
    { start: 6, end: 9 },
    { start: 601, end: 604 },
  ];

  it.each([
    [0, -1],
    [1, 0],
    [2.9, 0],
    [3, -1],
    [3.5, -1],
    [4, 1],
    [6, 2],
    [8.99, 2],
    [9, -1],
    [601, 3],
    [603.9, 3],
    [604, -1],
    [1e6, -1],
    [-1, -1],
    [Number.NaN, -1],
  ])('at %s plays turn %s', (at, index) => {
    expect(activeTurnIndex(turns, at)).toBe(index);
  });

  it('takes the latest start when two turns overlap, and handles no turn', () => {
    expect(activeTurnIndex([], 5)).toBe(-1);
    expect(
      activeTurnIndex(
        [
          { start: 4, end: 6 },
          { start: 4.6, end: 8 },
        ],
        4.7,
      ),
    ).toBe(1);
    expect(
      activeTurnIndex(
        [
          { start: 4, end: 4 },
          { start: 4, end: 9 },
        ],
        4,
      ),
    ).toBe(1);
  });

  it('walks back to a longer turn hidden by a short one that already ended', () => {
    expect(
      activeTurnIndex(
        [
          { start: 0, end: 10 },
          { start: 2, end: 4 },
        ],
        5,
      ),
    ).toBe(0);
    expect(
      activeTurnIndex(
        [
          { start: 4, end: 9 },
          { start: 4, end: 4 },
        ],
        4,
      ),
    ).toBe(0);
  });

  it('gives no turn in a silence between two turns, whatever came before', () => {
    const spans = [
      { start: 0, end: 10 },
      { start: 2, end: 4 },
      { start: 12, end: 14 },
    ];
    expect(activeTurnIndex(spans, 11)).toBe(-1);
    expect(lastStartedIndex(spans, 11)).toBe(1);
    expect(followedTurnIndex(spans, 11, runningMaxEnd(spans))).toBe(1);
    expect(followedTurnIndex(spans, 5, runningMaxEnd(spans))).toBe(0);
  });

  it('finds the turn playing among 1 000 by binary search', () => {
    const many = Array.from({ length: 1000 }, (_turn, index) => ({
      start: index * 5,
      end: index * 5 + 5,
    }));
    expect([
      activeTurnIndex(many, 2500),
      activeTurnIndex(many, 4999.9),
      activeTurnIndex(many, 5000),
    ]).toEqual([500, 999, -1]);
  });
});

describe('passageTurn', () => {
  const turns = speakerTurns([
    { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
    { id: '0-1', start: 3, end: 5, text: 'On commence.', speaker: 'A' },
    { id: '0-2', start: 5, end: 8, text: 'Salut.', speaker: 'B' },
  ]);

  it.each([
    ['a segment merged into a longer turn', { sourceId: '0-1', at: 3 }, 0],
    ['a segment opening its own turn', { sourceId: '0-2', at: 5 }, 1],
    ['a clarification, by its time', { sourceId: 'clarification:c1', at: 6 }, 1],
    [
      'a time after the last turn, the last one started',
      { sourceId: 'clarification:c2', at: 90 },
      1,
    ],
    ['a time before the first turn, none', { sourceId: 'clarification:c3', at: 0.5 }, -1],
  ])('finds %s', (_case, passage, index) => {
    expect(passageTurn(turns, passage)).toBe(index);
  });
});

describe('stableTurns', () => {
  const one: Segment = { id: '0-0', start: 1, end: 3, text: 'Un.', speaker: 'A' };
  const two: Segment = { id: '0-1', start: 3, end: 5, text: 'Deux.', speaker: 'B' };

  it('hands back the previous list when the poll brings the same turns', () => {
    const previous = speakerTurns([one]);
    expect(stableTurns(previous, speakerTurns([{ ...one }]))).toBe(previous);
  });

  it('keeps the unchanged turns and takes the new ones', () => {
    const previous = speakerTurns([one]);
    const next = speakerTurns([{ ...one }, two]);
    const merged = stableTurns(previous, next);
    expect(merged[0]).toBe(previous[0]);
    expect(merged[1]).toBe(next[1]);
  });

  it('takes a turn whose text grew', () => {
    const grown = speakerTurns([{ ...one, end: 5, text: 'Un. Deux.' }]);
    expect(stableTurns(speakerTurns([one]), grown)[0]).toBe(grown[0]);
  });
});
