import { LIVE_TRACKS, type LiveSegment, type LiveTrack } from '../../shared/live';
import { LiveDecodeQueue, type DecodeJob } from './live-decode-queue';
import {
  DEFAULT_SEGMENTER,
  flushSegmenter,
  initialSegmenter,
  segment,
  type SegmenterConfig,
  type SegmenterEvent,
  type SegmenterState,
} from './live-segmenter';
import type { LiveEngine } from './ports';

/** Where the draft goes; nothing of it is ever stored. */
export interface LiveDrafts {
  publish(segment: LiveSegment): void;
}

// Whisper marks silence and music between brackets: « [BLANK_AUDIO] », « [Musique] ».
const NON_SPEECH = /\[[^\]]*\]/g;

export function spokenText(raw: string): string {
  return raw.replace(NON_SPEECH, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Segments the PCM of each track into utterances and decodes them one at a time. A failed decode
 * is dropped: the live draft is best effort and never touches the recording.
 */
export class LiveTranscription {
  private readonly segmenters = new Map<LiveTrack, SegmenterState>();
  private readonly queue = new LiveDecodeQueue();
  private readonly revisions = new Map<string, number>();
  private active = false;
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

  push(track: LiveTrack, samples: Int16Array): void {
    if (!this.active) return;
    const step = segment(this.segmenters.get(track) ?? initialSegmenter(), samples, this.config);
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

  /** Drops the waiting utterances and the decode in progress. */
  stop(): void {
    this.active = false;
    this.session += 1;
    this.queue.clear();
    this.running?.abort();
    this.running = null;
    this.segmenters.clear();
    this.revisions.clear();
  }

  private enqueue(track: LiveTrack, events: SegmenterEvent[]): void {
    for (const event of events) this.queue.push({ track, event });
    if (events.length > 0) void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    const session = this.session;
    for (let job = this.queue.next(); job; job = this.queue.next()) {
      const controller = new AbortController();
      this.running = controller;
      const text = await this.decode(job, controller.signal);
      // Stopped meanwhile: the answer belongs to a finished session.
      if (session !== this.session) return;
      this.running = null;
      const draft = text === null ? null : this.draftOf(job, text);
      if (draft) this.drafts.publish(draft);
    }
  }

  private async decode(job: DecodeJob, signal: AbortSignal): Promise<string | null> {
    try {
      return spokenText(await this.engine.transcribe(job.event.samples, signal));
    } catch {
      return null;
    }
  }

  // An empty text is shown only to close a draft already on screen.
  private draftOf({ track, event }: DecodeJob, text: string): LiveSegment | null {
    const id = `${track}-${event.id}`;
    const previous = this.revisions.get(id);
    const final = event.kind === 'final';
    if (!text && (!final || previous === undefined)) return null;
    const revision = (previous ?? -1) + 1;
    if (final) this.revisions.delete(id);
    else this.revisions.set(id, revision);
    return { id, track, text, start: event.start, end: event.end, final, revision };
  }
}
