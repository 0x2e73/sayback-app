import { describe, expect, it } from 'vitest';
import { PaceTracker } from './analysis-pace';

const SECOND = 1_000;
const HOUR = 3_600 * SECOND;

describe('PaceTracker', () => {
  it('says nothing about a run it only just met, whatever its age', () => {
    // 1 segment of 30 after 63 minutes: no pace has been seen yet.
    const first = new PaceTracker();
    first.observe(1, 0);
    expect(first.remaining(30, 3_600, 63 * 60 * SECOND)).toBeNull();
    // 8 of 40 after 15 hours.
    const second = new PaceTracker();
    second.observe(8, 0);
    expect(second.remaining(40, 2_400, 15 * HOUR)).toBeNull();
  });

  it('waits for two progressions seen with its own eyes', () => {
    const tracker = new PaceTracker();
    tracker.observe(30, 0);
    expect(tracker.remaining(40, 2_400, 0)).toBeNull();
    tracker.observe(31, 60 * SECOND);
    expect(tracker.remaining(40, 2_400, 60 * SECOND)).toBeNull();
    tracker.observe(32, 120 * SECOND);
    // A resumed run at 30 of 40: 60 s per segment, 8 segments left.
    expect(tracker.remaining(40, 2_400, 120 * SECOND)).toBe(480);
  });

  it('measures the pace only over the segments finished while watching', () => {
    const tracker = new PaceTracker();
    tracker.observe(2, 0);
    tracker.observe(3, 500 * SECOND);
    tracker.observe(5, 560 * SECOND);
    tracker.observe(6, 590 * SECOND);
    // From the first progression seen: 3 segments in 90 s, 30 s each.
    expect(tracker.remaining(10, 3_600, 590 * SECOND)).toBe(120);
  });

  it('hides an estimate beyond three times the length of the meeting', () => {
    const tracker = new PaceTracker();
    tracker.observe(0, 0);
    tracker.observe(1, 60 * SECOND);
    tracker.observe(2, 120 * SECOND);
    expect(tracker.remaining(40, 800, 120 * SECOND)).toBe(2_280);
    expect(tracker.remaining(40, 100, 120 * SECOND)).toBeNull();
  });

  it('hides the estimate once nothing advances for twice the pace', () => {
    const tracker = new PaceTracker();
    tracker.observe(0, 0);
    tracker.observe(1, 60 * SECOND);
    tracker.observe(2, 120 * SECOND);
    expect(tracker.remaining(12, 3_600, 240 * SECOND)).not.toBeNull();
    expect(tracker.remaining(12, 3_600, 241 * SECOND)).toBeNull();
  });

  it('starts again when the run starts over', () => {
    const tracker = new PaceTracker();
    tracker.observe(0, 0);
    tracker.observe(1, 60 * SECOND);
    tracker.observe(2, 120 * SECOND);
    tracker.observe(0, 130 * SECOND);
    expect(tracker.remaining(12, 3_600, 130 * SECOND)).toBeNull();
  });

  it('has nothing to estimate once every segment is done', () => {
    const tracker = new PaceTracker();
    tracker.observe(0, 0);
    tracker.observe(1, 60 * SECOND);
    tracker.observe(2, 120 * SECOND);
    expect(tracker.remaining(2, 3_600, 120 * SECOND)).toBeNull();
  });
});
