import { z } from 'zod';

/** « Toi » is the microphone, « Les autres » the sound of the captured screen. */
export const liveTrackSchema = z.enum(['microphone', 'system']);
export type LiveTrack = z.infer<typeof liveTrackSchema>;
export const LIVE_TRACKS: readonly LiveTrack[] = liveTrackSchema.options;

/** The live path works on 16 kHz mono, the rate whisper.cpp expects. */
export const LIVE_SAMPLE_RATE = 16_000;
/** One block is 200 ms; a second is the most one message may carry. */
export const MAX_PCM_SAMPLES = LIVE_SAMPLE_RATE;

export const livePcmSchema = z.object({
  track: liveTrackSchema,
  samples: z
    .instanceof(Int16Array)
    .refine((samples) => samples.length >= 1 && samples.length <= MAX_PCM_SAMPLES),
});
export type LivePcm = z.infer<typeof livePcmSchema>;

/** Draft text of one utterance, replaced by a higher revision until it is final. */
export interface LiveSegment {
  /** `<track>-<n>`. */
  id: string;
  track: LiveTrack;
  text: string;
  /** Seconds of the track, pauses excluded. */
  start: number;
  end: number;
  final: boolean;
  revision: number;
}

export const LIVE_UNAVAILABLE_REASONS = ['no-model', 'no-binary', 'engine-failed'] as const;
export type LiveUnavailableReason = (typeof LIVE_UNAVAILABLE_REASONS)[number];

/** Independent of the recording: an unavailable live never stops it. */
export type LiveAvailability =
  | { state: 'off' }
  | { state: 'starting' }
  | { state: 'ready' }
  | { state: 'unavailable'; reason: LiveUnavailableReason };

/** What a subscriber reloads: the availability, the latest finals and the open drafts. */
export interface LiveTranscriptSnapshot {
  availability: LiveAvailability;
  segments: LiveSegment[];
}
