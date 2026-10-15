import { z } from 'zod';
import type { RecordingState } from './recording-state';

/** Audio level sent by the main page ten times a second. */
export const liveLevelSchema = z.number().finite().min(0).max(1);

/** What the island may ask; `open` brings the SayBack window forward. */
export const islandRequestSchema = z.enum(['pause', 'resume', 'stop', 'open']);
export type IslandRequest = z.infer<typeof islandRequestSchema>;

/**
 * notch: wings on each side of the camera housing; pill: centred at the top of a screen without
 * a notch; below-bar: under the menu bar when the notch could not be measured.
 */
export type IslandKind = 'notch' | 'pill' | 'below-bar';

/** Sizes of the shell in points, the window being fixed at the open size. */
export interface IslandShape {
  kind: IslandKind;
  /** Height of the compact shell: the menu bar, or the notch. */
  barHeight: number;
  /** Width hidden by the hardware, kept empty between the two wings. */
  notchWidth: number;
  compactWidth: number;
  openWidth: number;
  openHeight: number;
}

export interface IslandSnapshot {
  recording: RecordingState;
  expanded: boolean;
  shape: IslandShape;
}
