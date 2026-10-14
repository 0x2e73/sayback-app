import { describe, expect, it } from 'vitest';
import { timeLabel } from '../../../shared/format';
import { parseMoment } from './moment';

const FORMAT = 'Indiquez un moment au format mm:ss, par exemple 04:12.';
const PAST_END = 'Ce moment dépasse la fin de la réunion (52:10).';
const duration = 3130.4;

describe('parseMoment', () => {
  it.each([
    ['04:12', 252],
    ['4:12', 252],
    ['1:5', 65],
    ['75', 75],
    ['00:00', 0],
    ['52:10', 3130],
    ['  1:05  ', 65],
  ])('reads « %s » as %s s', (input, seconds) => {
    expect(parseMoment(input, duration)).toEqual({ ok: true, seconds });
  });

  it.each([
    ['4 : 12', 'spaces around the colon'],
    ['4\u00a0:\u00a012', 'no-break spaces around the colon'],
    ['４:１２', 'full-width digits'],
    ['４：１２', 'a full-width colon'],
    ['\u00a04:12\u00a0', 'no-break spaces around the whole'],
    ['0 : 4 : 12', 'spaces in an hours form'],
  ])('reads « %s » (%s) as 4:12', (input) => {
    expect(parseMoment(input, duration)).toEqual({ ok: true, seconds: 252 });
  });

  it('reads hours on a long meeting', () => {
    expect(parseMoment('01:02:03', 7205)).toEqual({ ok: true, seconds: 3723 });
    expect(parseMoment('2:00:05', 7205)).toEqual({ ok: true, seconds: 7205 });
  });

  it.each(['', ' ', '-1:00', '1:60', '1:02:60', '1:60:00', '1.5', '4:12:', ':30', 'quatre'])(
    'refuses « %s »',
    (input) => {
      expect(parseMoment(input, duration)).toEqual({ ok: false, error: FORMAT });
    },
  );

  it.each(['52:11', '75:00', '01:02:03', '1:2:3', '99999999999999999999'])(
    'refuses « %s », past the end',
    (input) => {
      expect(parseMoment(input, duration)).toEqual({ ok: false, error: PAST_END });
    },
  );

  it('names the end in the player’s format', () => {
    expect(parseMoment('2:00:06', 7205)).toEqual({
      ok: false,
      error: 'Ce moment dépasse la fin de la réunion (120:05).',
    });
  });

  it.each([0, 4.9, 252.7, 3130.4])('reads back the prefilled %s s, to the second', (seconds) => {
    expect(parseMoment(timeLabel(seconds), duration)).toEqual({
      ok: true,
      seconds: Math.floor(seconds),
    });
  });
});
