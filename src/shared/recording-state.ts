import { z } from 'zod';

// One day: far beyond any meeting, but a bound on what the page may claim.
const MAX_ELAPSED = 86_400;

export const recordingStateSchema = z.discriminatedUnion('recording', [
  z.object({ recording: z.literal(false) }),
  z.object({
    recording: z.literal(true),
    elapsed: z.number().finite().min(0).max(MAX_ELAPSED),
    paused: z.boolean(),
  }),
]);

/** What the page tells the main process about the recording: seconds recorded at that instant. */
export type RecordingState =
  { recording: false } | { recording: true; elapsed: number; paused: boolean };
