import { describe, expect, it } from 'vitest';
import { nextNoiseFloor, speechThreshold } from './live-noise-floor';

describe('noise floor', () => {
  it('settles on a steady room level within a few seconds', () => {
    let floor = 0;
    for (let frame = 0; frame < 150; frame += 1) floor = nextNoiseFloor(floor, 0.01);

    expect(floor).toBeGreaterThan(0.009);
    expect(floor).toBeLessThanOrEqual(0.01);
  });

  it('barely moves on the onset of a word and falls fast when the room quiets', () => {
    const afterOnset = [0.2, 0.2, 0.2].reduce(nextNoiseFloor, 0.005);
    const afterQuiet = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0].reduce(nextNoiseFloor, 0.01);

    expect(afterOnset).toBeLessThan(0.02);
    expect(afterQuiet).toBeLessThan(0.002);
  });

  it('never puts the threshold below the minimum', () => {
    expect(speechThreshold(0, 0.015, 3)).toBe(0.015);
    expect(speechThreshold(0.01, 0.015, 3)).toBeCloseTo(0.03);
  });
});
