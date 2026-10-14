import { describe, expect, it } from 'vitest';
import { adjacentId, resolveSelection } from './selection';

const meetings: { id: string; createdAt: string }[] = [
  { id: 'monday', createdAt: '2026-10-12T08:00:00.000Z' },
  { id: 'wednesday', createdAt: '2026-10-14T08:00:00.000Z' },
  { id: 'tuesday', createdAt: '2026-10-13T08:00:00.000Z' },
];

type Row = { id: string; createdAt: string };

describe('resolveSelection', () => {
  it.each<[string, Row[], string | null, string | undefined]>([
    ['nothing in an empty list', [], 'monday', undefined],
    ['the chosen meeting', meetings, 'tuesday', 'tuesday'],
    ['the most recent one on first load', meetings, null, 'wednesday'],
    ['the most recent one when the chosen id was deleted', meetings, 'deleted', 'wednesday'],
    ['the most recent one for an empty id', meetings, '', 'wednesday'],
    [
      'the first of two meetings created at the same instant',
      [
        { id: 'first', createdAt: '2026-10-14T08:00:00.000Z' },
        { id: 'second', createdAt: '2026-10-14T08:00:00.000Z' },
      ],
      null,
      'first',
    ],
  ])('selects %s', (_case, list, chosenId, expected) => {
    expect(resolveSelection(list, chosenId)?.id).toBe(expected);
  });
});

describe('adjacentId', () => {
  const ids = ['a', 'b', 'c'];
  it.each<[string, string[], string | null, 1 | -1, string | null]>([
    ['nothing in an empty list', [], null, 1, null],
    ['the first row when nothing is selected', ids, null, 1, 'a'],
    ['the first row when the selection is filtered out', ids, 'gone', -1, 'a'],
    ['the next row going down', ids, 'b', 1, 'c'],
    ['the previous row going up', ids, 'b', -1, 'a'],
    ['the last row again at the bottom, no wrap', ids, 'c', 1, 'c'],
    ['the first row again at the top, no wrap', ids, 'a', -1, 'a'],
    ['the only row of a single-row list', ['a'], 'a', 1, 'a'],
  ])('gives %s', (_case, list, current, step, expected) => {
    expect(adjacentId(list, current, step)).toBe(expected);
  });
});
