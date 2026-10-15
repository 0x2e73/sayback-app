import { livePcmSchema } from '../shared/live';
import type { IpcRegistrar } from './ipc';
import type { LiveServices } from './live-services';

// Only a ceiling on messages before validation: the per-track token bucket of the live
// services does the real limiting, with room for a three-second burst on both tracks.
export const PCM_PER_SECOND = 100;

/** Audio of the live comes from the main page only, which owns the capture. */
export function registerLiveHandlers(
  { listen }: Pick<IpcRegistrar, 'listen'>,
  live: Pick<LiveServices, 'pcm'>,
): void {
  listen('live:pcm', (input) => live.pcm(livePcmSchema.parse(input)), ['main'], PCM_PER_SECOND);
}
