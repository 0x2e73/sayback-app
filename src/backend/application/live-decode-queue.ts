import type { LiveTrack } from '../../shared/live';
import type { SegmenterEvent } from './live-segmenter';

export interface DecodeJob {
  track: LiveTrack;
  event: SegmenterEvent;
}

/**
 * Finals first, in order; at most one partial waiting per track, the latest wins. On a slow
 * machine partials space out instead of piling up.
 */
export class LiveDecodeQueue {
  private finals: DecodeJob[] = [];
  private readonly partials = new Map<LiveTrack, DecodeJob>();

  push(job: DecodeJob): void {
    if (job.event.kind === 'final') {
      const waiting = this.partials.get(job.track);
      // The final carries the whole utterance: its waiting partial has nothing more to show.
      if (waiting?.event.id === job.event.id) this.partials.delete(job.track);
      this.finals.push(job);
      return;
    }
    // Deleted first so the track that waited longest is served first.
    this.partials.delete(job.track);
    this.partials.set(job.track, job);
  }

  next(): DecodeJob | undefined {
    const final = this.finals.shift();
    if (final) return final;
    const [first] = this.partials;
    if (!first) return undefined;
    this.partials.delete(first[0]);
    return first[1];
  }

  get size(): number {
    return this.finals.length + this.partials.size;
  }

  clear(): void {
    this.finals = [];
    this.partials.clear();
  }
}
