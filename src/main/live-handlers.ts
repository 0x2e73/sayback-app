import { livePcmSchema } from '../shared/live';
import type { IpcRegistrar } from './ipc';
import type { LiveServices } from './live-services';

// Two tracks of five 200 ms blocks a second: twice that before blocks are dropped.
export const PCM_PER_SECOND = 20;

/** Audio of the live comes from the main page only, which owns the capture. */
export function registerLiveHandlers(
  { listen }: Pick<IpcRegistrar, 'listen'>,
  live: Pick<LiveServices, 'pcm'>,
): void {
  listen('live:pcm', (input) => live.pcm(livePcmSchema.parse(input)), ['main'], PCM_PER_SECOND);
}
