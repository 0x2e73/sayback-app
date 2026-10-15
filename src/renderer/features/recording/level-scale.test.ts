import { describe, expect, it } from 'vitest';
import { decibelsOf, meterLevel, rmsOf, smoothLevel } from './level-scale';

describe('the speech scale of the level meter', () => {
  it('measures the RMS of samples and its dBFS', () => {
    expect(rmsOf([0.5, -0.5, 0.5, -0.5])).toBe(0.5);
    expect(rmsOf([])).toBe(0);
    expect(decibelsOf(1)).toBe(0);
    expect(decibelsOf(0.1)).toBeCloseTo(-20, 10);
    expect(decibelsOf(0.01)).toBeCloseTo(-40, 10);
    expect(decibelsOf(0)).toBe(-Infinity);
  });

  it.each([
    [-Infinity, 0],
    [-70, 0],
    [-55, 0],
    [-45, 0.25],
    [-35, 0.5],
    [-30, 0.625],
    [-25, 0.75],
    [-15, 1],
    [-6, 1],
    [0, 1],
  ])('puts %d dBFS at %d', (decibels, level) => {
    expect(meterLevel(decibels)).toBeCloseTo(level, 10);
  });

  it('fills half the meter or more with a normal voice', () => {
    // Speech picked up by a laptop microphone: about -35 to -20 dBFS RMS.
    expect(meterLevel(decibelsOf(10 ** (-35 / 20)))).toBeCloseTo(0.5, 10);
    expect(meterLevel(decibelsOf(10 ** (-20 / 20)))).toBeCloseTo(0.875, 10);
  });

  it('rises fast and falls slower', () => {
    expect(smoothLevel(0, 1)).toBeCloseTo(0.7, 10);
    expect(smoothLevel(0.7, 1)).toBeCloseTo(0.91, 10);
    expect(smoothLevel(1, 0)).toBeCloseTo(0.75, 10);
    expect(smoothLevel(0.75, 0)).toBeCloseTo(0.5625, 10);
    expect(smoothLevel(0.4, 0.4)).toBe(0.4);
  });
});
