import { expect, it } from 'vitest';
import type { Segment } from '../../../shared/contracts';
import { inReadingOrder } from './use-stable-turns';

const segment = (id: string, start: number): Segment => ({ id, start, end: start + 1, text: id });

it('orders segments by part, then by start, keeping the order of equal starts', () => {
  const ordered = inReadingOrder([
    segment('1-0', 601),
    segment('0-2', 9),
    segment('0-0', 4),
    segment('0-1', 4),
  ]);
  expect(ordered.map((item) => item.id)).toEqual(['0-0', '0-1', '0-2', '1-0']);
});

it('does not touch the transcript it is given', () => {
  const given = [segment('0-1', 9), segment('0-0', 4)];
  inReadingOrder(given);
  expect(given.map((item) => item.id)).toEqual(['0-1', '0-0']);
});
