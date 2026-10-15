import { z } from 'zod';
import { capturePrefsSchema, titleSchema } from './validation';

/**
 * The sources of a start outside the dialog. A screen capture names its screen (never a window),
 * and the system audio exists only with the screen, as `normalizeSelection` leaves it.
 */
export const startSelectionSchema = capturePrefsSchema
  .pick({ microphone: true, systemAudio: true, screen: true, screenId: true })
  .strict()
  .refine((selection) => !selection.screen || selection.screenId !== undefined, {
    message: 'Choisissez un écran.',
  })
  .refine((selection) => !selection.systemAudio || selection.screen, {
    message: 'Le son du système accompagne la capture d’écran.',
  });
export type StartSelection = z.infer<typeof startSelectionSchema>;

/** What the main renderer receives to start a recording without its dialog. */
export interface StartPayload {
  title: string;
  selection: StartSelection;
}

export interface RecordingStartRequest extends StartPayload {
  /** Echoed in the acknowledgement and the answer: a late answer is dropped. */
  id: string;
  /** Epoch ms after which the main process has given up: a start still running must stop. */
  deadline: number;
}

/**
 * screen-denied: macOS refuses the screen capture; no-audio-source: neither microphone nor
 * system audio; no-screen: the chosen screen is gone; failed: anything else, timeouts included.
 */
export const startErrorSchema = z.enum(['screen-denied', 'no-audio-source', 'no-screen', 'failed']);
export type RecordingStartError = z.infer<typeof startErrorSchema>;

export const startOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z.object({ ok: z.literal(false), error: startErrorSchema }).strict(),
]);
export type RecordingStartOutcome = z.infer<typeof startOutcomeSchema>;

/** The main renderer has received the request (`recording:start-accepted`). */
export const startAcceptedSchema = z.object({ id: z.string().min(1).max(64) }).strict();

/** The answer of the main renderer on `recording:start-result`. */
export const startAnswerSchema = z
  .object({ id: z.string().min(1).max(64), outcome: startOutcomeSchema })
  .strict();

export const islandStartSchema = z
  .object({ type: z.literal('start'), title: titleSchema, selection: startSelectionSchema })
  .strict();
export type IslandStart = z.infer<typeof islandStartSchema>;
