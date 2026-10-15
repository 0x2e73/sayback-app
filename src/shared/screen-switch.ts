import { z } from 'zod';

/** A screen chosen in the recording island, relayed to the page that owns the capture. */
export interface ScreenSwitchRequest {
  /** Echoed in the answer: a late answer is dropped. */
  id: string;
  screenId: string;
}

/** The page's answer on `recording:switch-result`: false keeps the capture on its screen. */
export const screenSwitchAnswerSchema = z
  .object({ id: z.string().min(1).max(64), ok: z.boolean() })
  .strict();
