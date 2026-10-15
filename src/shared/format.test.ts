import { describe, expect, it } from 'vitest';
import { chronoLabel } from './format';

describe('chronoLabel', () => {
  it.each([
    [0, '00:00'],
    [9.9, '00:09'],
    [65, '01:05'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [-4, '00:00'],
    [36000, '10:00:00'],
  ])('writes %s seconds as %s', (seconds, label) => {
    expect(chronoLabel(seconds)).toBe(label);
  });
});
