import { z } from 'zod';
import type { SourceToggles } from './capture-selection';
import type { RecordingState } from './recording-state';
import { islandStartSchema, type RecordingStartError } from './recording-start';

/** Audio level sent by the main page ten times a second. */
export const liveLevelSchema = z.number().finite().min(0).max(1);

/**
 * What the island may ask. Recording: pause, resume, stop, `expand` (a click on the closed wings),
 * and `open` brings SayBack forward.
 * Ready: `open` opens the dialog instead, `close` is the ×, `open-privacy-settings` opens the
 * screen recording pane, `cycle-screen` moves to the next screen, `{ type: 'start' }` starts.
 */
export const islandRequestSchema = z.union([
  z.enum([
    'pause',
    'resume',
    'stop',
    'open',
    'expand',
    'close',
    'open-privacy-settings',
    'cycle-screen',
  ]),
  islandStartSchema,
]);
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

export interface IslandScreen {
  id: string;
  /** « Écran 1 » is the main screen. */
  name: string;
}

/** What the ready island draws, read afresh at each opening. */
export interface IslandReadyState {
  /** The default title at the opening; not editable in the island. */
  title: string;
  /** The sources remembered at the opening; the page keeps its own toggles afterwards. */
  remembered: SourceToggles;
  /** The remembered screen if it is still there, else the main one; null without any screen. */
  screen: IslandScreen | null;
  /** « Changer » is offered from two screens. */
  screenCount: number;
  /** The error that replaces the screen line, or null. */
  error: RecordingStartError | null;
}

interface IslandFrame {
  recording: RecordingState;
  expanded: boolean;
  shape: IslandShape;
}

export type IslandSnapshot =
  | (IslandFrame & { mode: 'recording' })
  | (IslandFrame & { mode: 'ready'; ready: IslandReadyState });
