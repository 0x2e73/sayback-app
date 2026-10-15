import { z } from 'zod';
import type { IslandLiveSnapshot } from '../shared/live';
import type { RegisterHandler } from './ipc';
import type { IslandWindowPort } from './island-ports';
import type { LiveTranscriptHub } from './live-transcript-hub';

export const ISLAND_LIVE = 'island:live';
export const ISLAND_LIVE_SEGMENT = 'island:live-segment';
// The page asks on load and after a reload: a few times a second at most.
export const LIVE_SNAPSHOTS_PER_SECOND = 5;

export interface IslandLiveDeps {
  transcript: Pick<LiveTranscriptHub, 'snapshot' | 'subscribe'>;
  /** The setting, read at each event so a change applies at once. */
  enabled(): boolean;
  window(): Pick<IslandWindowPort, 'webContents'> | null;
}

export interface IslandLiveRelay {
  snapshot(): IslandLiveSnapshot;
  /** The setting moved: the island gets the transcript, or loses it. */
  settingChanged(): void;
}

/**
 * Carries the live draft to the island: each revised utterance, and the whole snapshot when the
 * status changes or the recording ends. Off, nothing of the transcript leaves the main process.
 */
export function createIslandLiveRelay(deps: IslandLiveDeps): IslandLiveRelay {
  function snapshot(): IslandLiveSnapshot {
    if (!deps.enabled()) return { enabled: false };
    return { enabled: true, ...deps.transcript.snapshot() };
  }

  function send(channel: string, payload: unknown): void {
    const target = deps.window();
    if (target && !target.webContents.isDestroyed()) target.webContents.send(channel, payload);
  }

  deps.transcript.subscribe((event) => {
    if (!deps.enabled()) return;
    if (event.kind === 'segment') send(ISLAND_LIVE_SEGMENT, event.segment);
    else send(ISLAND_LIVE, snapshot());
  });

  return { snapshot, settingChanged: () => send(ISLAND_LIVE, snapshot()) };
}

/** The island asks for the snapshot; only the main page may change the setting. */
export function registerIslandLive(
  handle: RegisterHandler,
  relay: IslandLiveRelay,
  setting: { set(value: boolean): void },
): void {
  handle('island:live-snapshot', () => relay.snapshot(), ['island'], LIVE_SNAPSHOTS_PER_SECOND);
  handle('settings:set-island-live-text', (value) => {
    setting.set(z.boolean().parse(value));
    relay.settingChanged();
  });
}
