import type { LiveAvailability, LiveSegment, LiveTranscriptSnapshot } from '../shared/live';

export type LiveTranscriptEvent =
  | { kind: 'segment'; segment: LiveSegment }
  | { kind: 'availability'; availability: LiveAvailability }
  | { kind: 'cleared' };

export type LiveTranscriptListener = (event: LiveTranscriptEvent) => void;

/** Enough for a reloaded island to show the last turns; the draft is never stored. */
export const KEPT_FINALS = 30;
// One open utterance per track, and one more while its final is decoded.
const KEPT_DRAFTS = 4;

export interface LiveTranscriptHub {
  publish(segment: LiveSegment): void;
  setAvailability(availability: LiveAvailability): void;
  /** At the end of the recording: the draft is gone for good. */
  clear(): void;
  snapshot(): LiveTranscriptSnapshot;
  /** Returns the unsubscribe function. */
  subscribe(listener: LiveTranscriptListener): () => void;
}

function dropOldest(segments: Map<string, LiveSegment>, final: boolean, keep: number): void {
  const matching = [...segments.values()].filter((segment) => segment.final === final);
  for (const segment of matching.slice(0, Math.max(0, matching.length - keep))) {
    segments.delete(segment.id);
  }
}

export function createLiveTranscriptHub(): LiveTranscriptHub {
  let availability: LiveAvailability = { state: 'off' };
  // Insertion order is the order of the utterances; a revision replaces in place.
  const segments = new Map<string, LiveSegment>();
  const listeners = new Set<LiveTranscriptListener>();

  function emit(event: LiveTranscriptEvent): void {
    for (const listener of listeners) {
      // The island and any later subscriber are independent: one failure stops none of them.
      try {
        listener(event);
      } catch (error) {
        console.error('[live-transcript] a subscriber failed', error);
      }
    }
  }

  function publish(segment: LiveSegment): void {
    const known = segments.get(segment.id);
    if (known && known.revision >= segment.revision) return;
    // An empty final closes its draft: subscribers are told so they remove it.
    if (segment.final && !segment.text) segments.delete(segment.id);
    else segments.set(segment.id, segment);
    dropOldest(segments, true, KEPT_FINALS);
    dropOldest(segments, false, KEPT_DRAFTS);
    emit({ kind: 'segment', segment });
  }

  return {
    publish,
    setAvailability(next) {
      availability = next;
      emit({ kind: 'availability', availability: next });
    },
    clear() {
      if (segments.size === 0) return;
      segments.clear();
      emit({ kind: 'cleared' });
    },
    snapshot: () => ({ availability, segments: [...segments.values()] }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
