import { z } from 'zod';
import type { SourceToggles } from './capture-selection';
import type { RecordingState } from './recording-state';
import { islandStartSchema, type RecordingStartError } from './recording-start';
import { screenIdSchema } from './validation';

/** Audio level sent by the main page ten times a second. */
export const liveLevelSchema = z.number().finite().min(0).max(1);

/** A tile of the screen picker: the ready island remembers it, the recording one switches to it. */
export const selectScreenSchema = z
  .object({ type: z.literal('select-screen'), screenId: screenIdSchema })
  .strict();
export type SelectScreen = z.infer<typeof selectScreenSchema>;

/**
 * What the island may ask. Recording: pause, resume, stop, `expand` (a click on the closed wings),
 * and `open` brings SayBack forward.
 * Ready: `open` opens the dialog instead, `close` is the × and Escape, `open-privacy-settings`
 * opens the screen recording pane, `refresh-screens` lists the screens again (« Réessayer »),
 * `{ type: 'start' }` starts. Both: `{ type: 'select-screen' }` picks a screen.
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
    'refresh-screens',
  ]),
  islandStartSchema,
  selectScreenSchema,
]);
export type IslandRequest = z.infer<typeof islandRequestSchema>;

/** A screen's thumbnail for the picker, as JPEG bytes the page shows through a `blob:` URL. */
export interface IslandThumbnail {
  id: string;
  jpeg: Uint8Array;
}

/** The size and JPEG quality (0 to 100) of a picker thumbnail. */
export const ISLAND_THUMBNAIL = { width: 176, height: 110, quality: 60 } as const;

/** A preview frame of 276 × 172 px weighs a few kilobytes: far more is not a frame. */
export const MAX_PREVIEW_BYTES = 256 * 1024;
export const previewFrameSchema = z
  .instanceof(Uint8Array)
  .refine((bytes) => bytes.length >= 1 && bytes.length <= MAX_PREVIEW_BYTES);

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
  /** The tiles of the picker, offered from two screens. */
  screens: IslandScreen[];
  /** The error that replaces the screen line, or null. */
  error: RecordingStartError | null;
}

interface IslandFrame {
  recording: RecordingState;
  expanded: boolean;
  shape: IslandShape;
}

export type IslandSnapshot =
  | (IslandFrame & { mode: 'recording'; screens: IslandScreen[] })
  | (IslandFrame & { mode: 'ready'; ready: IslandReadyState });
