import { LIVE_TRACKS, type LiveSegment, type LiveTrack } from '../../shared/live';
import { LiveDecodeQueue, type DecodeJob } from './live-decode-queue';
import {
  DEFAULT_SEGMENTER,
  flushSegmenter,
  initialSegmenter,
  segmentAt,
  type SegmenterConfig,
  type SegmenterEvent,
  type SegmenterState,
} from './live-segmenter';
import { spokenText } from './live-spoken-text';
import type { LiveEngine } from './ports';

/** Where the draft goes; nothing of it is ever stored. */
export interface LiveDrafts {
  publish(segment: LiveSegment): void;
}

/**
 * Segments the PCM of each track into utterances and decodes them one at a time. A failed decode
 * is dropped: the live draft is best effort and never touches the recording.
 */
export class LiveTranscription {
  private readonly segmenters = new Map<LiveTrack, SegmenterState>();
  private readonly queue = new LiveDecodeQueue();
  /** The last draft shown of each open utterance. */
  private readonly shown = new Map<string, { revision: number; text: string }>();
  private active = false;
  /** Utterances wait, within the queue bounds, until the engine answers. */
  private engineReady = false;
  private session = 0;
  private running: AbortController | null = null;

  constructor(
    private readonly engine: LiveEngine,
    private readonly drafts: LiveDrafts,
    private readonly config: SegmenterConfig = DEFAULT_SEGMENTER,
  ) {}

  start(): void {
    this.stop();
    this.active = true;
  }

  /** `offset`: where the block starts, in samples of the track, pauses excluded. */
  push(track: LiveTrack, samples: Int16Array, offset: number): void {
    if (!this.active) return;
    const state = this.segmenters.get(track) ?? initialSegmenter();
    const step = segmentAt(state, offset, samples, this.config);
    this.segmenters.set(track, step.state);
    this.enqueue(track, step.events);
  }

  /** Paused: each open utterance is closed; the next audio is not continuous with it. */
  pause(): void {
    if (!this.active) return;
    for (const track of LIVE_TRACKS) {
      const state = this.segmenters.get(track);
      if (!state) continue;
      const step = flushSegmenter(state, this.config);
      this.segmenters.set(track, step.state);
      this.enqueue(track, step.events);
    }
  }

  /** The engine answers, or stopped answering (loading, restarting). */
  setEngineReady(ready: boolean): void {
    this.engineReady = ready;
    if (ready) void this.drain();
  }

  /** Drops the waiting utterances and the decode in progress. */
  stop(): void {
    this.active = false;
    this.session += 1;
    this.queue.clear();
    this.running?.abort();
    this.running = null;
    this.segmenters.clear();
    this.shown.clear();
  }

  private enqueue(track: LiveTrack, events: SegmenterEvent[]): void {
    for (const event of events) {
      for (const dropped of this.queue.push({ track, event })) this.giveUp(dropped);
    }
    if (events.length > 0) void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    const session = this.session;
    for (let job = this.nextJob(); job; job = this.nextJob()) {
      const controller = new AbortController();
      this.running = controller;
      const text = await this.decode(job, controller.signal);
      // Stopped meanwhile: the answer belongs to a finished session.
      if (session !== this.session) return;
      this.running = null;
      const draft = this.draftOf(job, text);
      if (draft) this.drafts.publish(draft);
    }
  }

  private nextJob(): DecodeJob | undefined {
    return this.engineReady ? this.queue.next() : undefined;
  }

  // A final given up for room still closes its draft with the last text shown.
  private giveUp(job: DecodeJob): void {
    const draft = this.draftOf(job, null);
    if (draft) this.drafts.publish(draft);
  }

  private async decode(job: DecodeJob, signal: AbortSignal): Promise<string | null> {
    try {
      return spokenText(await this.engine.transcribe(job.event.samples, signal));
    } catch {
      return null;
    }
  }

  /**
   * An empty text is shown only to close a draft already on screen. A final that failed keeps the
   * last draft, so no utterance stays open forever.
   */
  private draftOf({ track, event }: DecodeJob, decoded: string | null): LiveSegment | null {
    const id = `${track}-${event.id}`;
    const previous = this.shown.get(id);
    const final = event.kind === 'final';
    const text = decoded ?? (final ? previous?.text : undefined);
    if (text === undefined || (!text && (!final || !previous))) return null;
    const revision = (previous?.revision ?? -1) + 1;
    if (final) this.shown.delete(id);
    else this.shown.set(id, { revision, text });
    return { id, track, text, start: event.start, end: event.end, final, revision };
  }
}
