import { describe, expect, it } from 'vitest';
import { durationLabel, meetingDateLabel, shortTimeLabel } from './detail-format';

describe('meetingDateLabel', () => {
  it.each([
    ['2026-10-12T08:00:00Z', '12 oct. 2026'],
    ['2026-05-03T10:00:00Z', '3 mai 2026'],
    ['2026-10-14T22:30:00Z', '15 oct. 2026'],
    ['2026-12-31T23:30:00Z', '1 janv. 2027'],
    ['nope', 'Date inconnue'],
    ['', 'Date inconnue'],
  ])('dates %s as « %s » in Zurich', (createdAt, label) => {
    expect(meetingDateLabel(createdAt)).toBe(label);
  });
});

describe('durationLabel', () => {
  it.each([
    [0, '0 s'],
    [-5, '0 s'],
    [Number.NaN, '0 s'],
    [Number.POSITIVE_INFINITY, '0 s'],
    [45.9, '45 s'],
    [59.99, '59 s'],
    [60, '1 min'],
    [89, '1 min'],
    [90, '2 min'],
    [3130, '52 min'],
    [3569, '59 min'],
    [3570, '1 h 00'],
    [3723, '1 h 02'],
    [7205, '2 h 00'],
  ])('reads %s s as « %s »', (seconds, label) => {
    expect(durationLabel(seconds)).toBe(label);
  });
});

describe('shortTimeLabel', () => {
  it.each([
    [0, '0:00'],
    [4.9, '0:04'],
    [31, '0:31'],
    [252, '4:12'],
    [252.99, '4:12'],
    [3723, '62:03'],
    [-3, '0:00'],
    [Number.NaN, '0:00'],
  ])('stamps %s s as %s', (seconds, label) => {
    expect(shortTimeLabel(seconds)).toBe(label);
  });
});
