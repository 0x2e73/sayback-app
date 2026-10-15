import { islandRequestSchema, liveLevelSchema } from '../shared/island';
import type { Island } from './island-controller';
import type { IpcRegistrar } from './ipc';

/** The island may only call its two channels; the level comes from the main page only. */
export function registerIslandHandlers({ handle, listen }: IpcRegistrar, island: Island): void {
  handle('island:ready', () => island.ready(), ['island']);
  handle('island:request', (input) => island.request(islandRequestSchema.parse(input)), ['island']);
  listen(
    'live:level',
    (input) => {
      if (island.window()) island.level(liveLevelSchema.parse(input));
    },
    ['main'],
  );
}
