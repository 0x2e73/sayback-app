import { describe, expect, it } from 'vitest';
import { formatRowDate, groupByDate } from './date-groups';

// Local wall-clock time, month 1-based, so the cases read like a calendar.
const local = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).toISOString();

const wednesday = new Date(2026, 9, 14, 10, 0);
const labelOf = (createdAt: string, now: Date) => groupByDate([{ createdAt }], now)[0]?.label;

describe('groupByDate', () => {
  it.each([
    ['earlier today', local(2026, 10, 14, 8, 30), 'Aujourd’hui'],
    ['at midnight sharp', local(2026, 10, 14, 0, 0), 'Aujourd’hui'],
    ['one minute before midnight', local(2026, 10, 13, 23, 59), 'Hier'],
    ['on Monday of this week', local(2026, 10, 12, 9), 'Cette semaine'],
    ['on the Sunday before, same month', local(2026, 10, 11, 18), 'Ce mois-ci'],
    ['on the first of the month', local(2026, 10, 1), 'Ce mois-ci'],
    ['the month before', local(2026, 9, 30), 'Septembre 2026'],
    ['another year', local(2025, 12, 24), 'Décembre 2025'],
    ['tomorrow, a clock ahead', local(2026, 10, 15, 9), 'Aujourd’hui'],
    ['in UTC before midnight, after it in Zurich', '2026-10-13T22:30:00.000Z', 'Aujourd’hui'],
  ])('puts a meeting %s under its heading', (_case, createdAt, label) => {
    expect(labelOf(createdAt, wednesday)).toBe(label);
  });

  it.each([
    ['Monday: Sunday is yesterday', new Date(2026, 9, 12, 9), local(2026, 10, 11, 18), 'Hier'],
    [
      'Monday: Saturday is last week',
      new Date(2026, 9, 12, 9),
      local(2026, 10, 10, 18),
      'Ce mois-ci',
    ],
    [
      'Sunday: Monday is this week',
      new Date(2026, 9, 18, 20),
      local(2026, 10, 12, 8),
      'Cette semaine',
    ],
    ['a week over two months', new Date(2026, 9, 1, 10), local(2026, 9, 28), 'Cette semaine'],
    [
      'the Sunday before that week',
      new Date(2026, 9, 1, 10),
      local(2026, 9, 27, 20),
      'Septembre 2026',
    ],
    [
      'New Year: 31 December is yesterday',
      new Date(2027, 0, 1, 10),
      local(2026, 12, 31, 23),
      'Hier',
    ],
    [
      'New Year: the week began last year',
      new Date(2027, 0, 1, 10),
      local(2026, 12, 28, 9),
      'Cette semaine',
    ],
    [
      'New Year: not « Ce mois-ci »',
      new Date(2027, 0, 1, 10),
      local(2026, 12, 27, 9),
      'Décembre 2026',
    ],
    [
      'the night the clocks go back',
      new Date(2026, 9, 26, 0, 30),
      local(2026, 10, 25, 0, 30),
      'Hier',
    ],
  ])('counts weeks from Monday, as fr-CH does: %s', (_case, now, createdAt, label) => {
    expect(labelOf(createdAt, now)).toBe(label);
  });

  it('orders groups and meetings newest first, whatever the input order', () => {
    const groups = groupByDate(
      [
        { id: 'old', createdAt: local(2026, 9, 30) },
        { id: 'morning', createdAt: local(2026, 10, 14, 8) },
        { id: 'later', createdAt: local(2026, 10, 14, 9) },
        { id: 'yesterday', createdAt: local(2026, 10, 13, 9) },
      ],
      wednesday,
    );
    expect(groups.map((group) => [group.key, group.items.map((item) => item.id)])).toEqual([
      ['today', ['later', 'morning']],
      ['yesterday', ['yesterday']],
      ['2026-09', ['old']],
    ]);
  });

  it.each([['nope'], ['']])('puts the date %j under « Date inconnue », last', (createdAt) => {
    const groups = groupByDate(
      [
        { id: 'broken', createdAt },
        { id: 'old', createdAt: local(2026, 9, 30) },
        { id: 'today', createdAt: local(2026, 10, 14, 8) },
      ],
      wednesday,
    );
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ['Aujourd’hui', ['today']],
      ['Septembre 2026', ['old']],
      ['Date inconnue', ['broken']],
    ]);
  });

  it('keeps every meeting when all the dates are unreadable', () => {
    const groups = groupByDate([{ createdAt: 'nope' }, { createdAt: '' }], wednesday);
    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ['Date inconnue', 2],
    ]);
  });

  it('returns no group for no meeting', () => {
    expect(groupByDate([], wednesday)).toEqual([]);
  });
});

describe('formatRowDate', () => {
  it.each([
    ['later today', local(2026, 10, 14, 14, 32), wednesday, '14:32'],
    ['at midnight sharp', local(2026, 10, 14, 0, 0), wednesday, '00:00'],
    ['one minute before midnight', local(2026, 10, 13, 23, 59), wednesday, 'Hier'],
    ['yesterday at midnight', local(2026, 10, 13, 0, 0), wednesday, 'Hier'],
    ['the day before yesterday', local(2026, 10, 12, 23, 59), wednesday, '12 oct.'],
    ['in September', local(2026, 9, 3), wednesday, '3 sept.'],
    ['on New Year’s Day', local(2026, 1, 1), wednesday, '1 janv.'],
    ['last year', local(2025, 10, 11), wednesday, '11 oct. 2025'],
    ['on 31 December, seen on 1 January', local(2025, 12, 31, 23), new Date(2026, 0, 1, 8), 'Hier'],
    ['in UTC before midnight, after it in Zurich', '2026-10-13T22:30:00.000Z', wednesday, '00:30'],
    ['tomorrow, a clock ahead', local(2026, 10, 15, 9), wednesday, '15 oct. 2026'],
    ['a year ahead', local(2027, 10, 14, 9), wednesday, '14 oct. 2027'],
    ['an invalid date', 'nope', wednesday, '—'],
    ['an empty date', '', wednesday, '—'],
  ])('dates a meeting %s', (_case, createdAt, now, expected) => {
    expect(formatRowDate(createdAt, now)).toBe(expected);
  });
});
