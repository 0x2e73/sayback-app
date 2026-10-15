import { z } from 'zod';

// One day: far beyond any meeting, but a bound on what the page may claim.
const MAX_ELAPSED = 86_400;

export const recordingStateSchema = z.discriminatedUnion('recording', [
  z.object({ recording: z.literal(false) }),
  z.object({
    recording: z.literal(true),
    elapsed: z.number().finite().min(0).max(MAX_ELAPSED),
    paused: z.boolean(),
    stopping: z.boolean(),
    sourceId: z.string().min(1).max(200).optional(),
  }),
]);

/**
 * What the page tells the main process about the recording: seconds recorded at that instant,
 * paused, or closing (stop asked, files being finished), and the screen or window captured,
 * absent for a recording of the sound alone.
 */
export type RecordingState =
  | { recording: false }
  | { recording: true; elapsed: number; paused: boolean; stopping: boolean; sourceId?: string };

/** Asked by the main process (menu bar, island) to the page that owns the capture. */
export const recordingRequestSchema = z.enum(['pause', 'resume', 'stop']);
export type RecordingRequest = z.infer<typeof recordingRequestSchema>;

/**
 * Seconds recorded at `now`, for a state received at `receivedAt` (same monotonic clock, in ms).
 * The count is frozen while paused or closing.
 */
export function elapsedAt(state: RecordingState, receivedAt: number, now: number): number {
  if (!state.recording) return 0;
  if (state.paused || state.stopping) return state.elapsed;
  return state.elapsed + Math.max(0, now - receivedAt) / 1000;
}
