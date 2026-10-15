import type { LiveTrack } from '../../shared/live';
import type { SegmenterEvent } from './live-segmenter';

export interface DecodeJob {
  track: LiveTrack;
  event: SegmenterEvent;
}

/** Up to 45 s of audio per track waits; older finals are given up, newest speech first. */
export const MAX_FINALS_PER_TRACK = 3;

/**
 * Finals first, in order, at most three per track. A partial waits only when no final does,
 * one per track, the latest winning: on a slow machine partials space out instead of piling up.
 */
export class LiveDecodeQueue {
  private finals: DecodeJob[] = [];
  private readonly partials = new Map<LiveTrack, DecodeJob>();

  /** Returns the finals given up to make room, so their draft can still be closed. */
  push(job: DecodeJob): DecodeJob[] {
    if (job.event.kind === 'partial') {
      if (this.finals.length > 0) return [];
      // Deleted first so the track that waited longest is served first.
      this.partials.delete(job.track);
      this.partials.set(job.track, job);
      return [];
    }
    const waiting = this.partials.get(job.track);
    // The final carries the whole utterance: its waiting partial has nothing more to show.
    if (waiting?.event.id === job.event.id) this.partials.delete(job.track);
    this.finals.push(job);
    return this.trim(job.track);
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

  private trim(track: LiveTrack): DecodeJob[] {
    const ofTrack = this.finals.filter((job) => job.track === track);
    const dropped = ofTrack.slice(0, Math.max(0, ofTrack.length - MAX_FINALS_PER_TRACK));
    if (dropped.length > 0) this.finals = this.finals.filter((job) => !dropped.includes(job));
    return dropped;
  }
}
