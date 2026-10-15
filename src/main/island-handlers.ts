import {
  islandRequestSchema,
  liveLevelSchema,
  previewFrameSchema,
  type IslandThumbnail,
} from '../shared/island';
import type { IpcRegistrar } from './ipc';
import type { Island } from './island-ports';

// Clicks of a person on the island: a few a second at most.
export const ISLAND_REQUESTS_PER_SECOND = 5;
// Read when the picker opens, never refreshed while it stays open.
export const THUMBNAILS_PER_SECOND = 2;
// About one frame a second: three is a page that lost its timer, not a preview.
export const PREVIEW_FRAMES_PER_SECOND = 3;

/** The island may only call its channels; the level and the preview come from the main page. */
export function registerIslandHandlers(
  { handle, listen }: IpcRegistrar,
  island: Island,
  thumbnails: () => Promise<IslandThumbnail[]>,
): void {
  handle('island:ready', () => island.ready(), ['island']);
  handle(
    'island:request',
    (input) => island.request(islandRequestSchema.parse(input)),
    ['island'],
    ISLAND_REQUESTS_PER_SECOND,
  );
  handle('island:screen-thumbnails', () => thumbnails(), ['island'], THUMBNAILS_PER_SECOND);
  listen(
    'live:level',
    (input) => {
      if (island.window()) island.level(liveLevelSchema.parse(input));
    },
    ['main'],
  );
  listen(
    'live:preview',
    (input) => {
      if (island.window()) island.preview(previewFrameSchema.parse(input));
    },
    ['main'],
    PREVIEW_FRAMES_PER_SECOND,
  );
}
