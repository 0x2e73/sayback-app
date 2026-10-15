import { islandRequestSchema, liveLevelSchema } from '../shared/island';
import type { IpcRegistrar } from './ipc';
import type { Island } from './island-ports';

// Clicks of a person on the island: a few a second at most.
export const ISLAND_REQUESTS_PER_SECOND = 5;

/** The island may only call its two channels; the level comes from the main page only. */
export function registerIslandHandlers({ handle, listen }: IpcRegistrar, island: Island): void {
  handle('island:ready', () => island.ready(), ['island']);
  handle(
    'island:request',
    (input) => island.request(islandRequestSchema.parse(input)),
    ['island'],
    ISLAND_REQUESTS_PER_SECOND,
  );
  listen(
    'live:level',
    (input) => {
      if (island.window()) island.level(liveLevelSchema.parse(input));
    },
    ['main'],
  );
}
