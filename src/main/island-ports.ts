import type { IslandRequest, IslandSnapshot } from '../shared/island';
import type { RecordingRequest } from '../shared/recording-state';
import type { IslandLayout, Rect } from './island-geometry';
import type { HoverDeps, IslandHover } from './island-hover';
import type { ReadyPorts } from './island-ready';
import type { RecordingStateHub } from './recording-state-hub';

export interface IslandWindowPort {
  readonly webContents: {
    readonly mainFrame: unknown;
    send(channel: string, payload: unknown): void;
    isDestroyed(): boolean;
    on(event: 'render-process-gone', listener: () => void): unknown;
  };
  showInactive(): void;
  setBounds(bounds: Rect): void;
  setIgnoreMouseEvents(ignore: boolean): void;
  isDestroyed(): boolean;
  /** Identifier of the window among the capture sources. */
  getMediaSourceId(): string;
  destroy(): void;
}

/** Everything the hover needs but the cursor, which the Electron side reads. */
export type HoverOptions = Omit<HoverDeps, 'cursor' | 'now'>;

export interface IslandPorts {
  hub: Pick<RecordingStateHub, 'current' | 'elapsed' | 'subscribe'>;
  /** Where the island goes on the current screens; null when no screen can hold it. */
  layout(): Promise<IslandLayout | null>;
  openWindow(layout: IslandLayout): IslandWindowPort;
  startHover(options: HoverOptions): IslandHover;
  ready: ReadyPorts;
  /** « Ouvrir SayBack » on the recording island. */
  openApp(): void;
  /** « Ouvrir SayBack » on the ready island: the dialog, to change the title or pick a window. */
  openDialog(): void;
  /** The screen recording pane of the system settings. */
  openPrivacySettings(): void;
  /** Sent to the main page, which owns the capture. */
  request(request: RecordingRequest): void;
}

export interface Island {
  /** The island window while it exists, for the IPC roles. */
  window(): IslandWindowPort | null;
  /** The page has loaded: shows the window and returns what to draw. */
  ready(): IslandSnapshot;
  request(request: IslandRequest): void;
  /** The menu bar icon: opens or closes the ready island; during a recording, opens its island. */
  toggle(): void;
  level(level: number): void;
  screensChanged(): Promise<void>;
  close(): void;
}
