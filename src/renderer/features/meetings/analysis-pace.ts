import { durationLabel } from './detail-format';

interface Sample {
  done: number;
  at: number;
}

/** An estimate longer than this many meeting durations is not worth showing. */
const MAX_MEETING_LENGTHS = 3;
/** Nothing finished for this many paces: the run is stuck, the pace no longer holds. */
const STALL_PACES = 2;

/**
 * Measures the pace of an analysis from the segments finished while someone watches it.
 * A run met half-way, or resumed, says nothing about its pace until it moved twice.
 */
export class PaceTracker {
  private last: Sample | null = null;
  /** The first progression seen: the pace is measured from it, not from the arrival. */
  private anchor: Sample | null = null;
  private progressions = 0;

  observe(done: number, at: number): void {
    if (!this.last || done < this.last.done) {
      this.last = { done, at };
      this.anchor = null;
      this.progressions = 0;
      return;
    }
    if (done === this.last.done) return;
    this.last = { done, at };
    this.anchor ??= this.last;
    this.progressions += 1;
  }

  /** Seconds left, or null when there is no honest estimate. */
  remaining(total: number, meetingDuration: number, now: number): number | null {
    const { last, anchor } = this;
    if (!last || !anchor || this.progressions < 2 || last.done >= total) return null;
    const pace = (last.at - anchor.at) / 1_000 / (last.done - anchor.done);
    if (!(pace > 0)) return null;
    if (now - last.at > STALL_PACES * pace * 1_000) return null;
    const seconds = pace * (total - last.done);
    return seconds > MAX_MEETING_LENGTHS * meetingDuration ? null : seconds;
  }
}

export function remainingLabel(seconds: number): string {
  return `environ ${durationLabel(seconds)}`;
}
