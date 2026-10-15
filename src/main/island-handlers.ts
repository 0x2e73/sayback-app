import {
  islandRequestSchema,
  liveLevelSchema,
  type IslandRequest,
  type IslandSnapshot,
} from '../shared/island';
import type { RecordingRequest } from '../shared/recording-state';
import type { IslandLayout, Rect } from './island-geometry';
import type { HoverArea, IslandHover } from './island-hover';
import type { IpcRegistrar } from './ipc';
import type { RecordingSnapshot, RecordingStateHub } from './recording-state-hub';

export interface IslandWindowPort {
  readonly webContents: {
    readonly mainFrame: unknown;
    send(channel: string, payload: unknown): void;
    isDestroyed(): boolean;
  };
  showInactive(): void;
  setBounds(bounds: Rect): void;
  setIgnoreMouseEvents(ignore: boolean): void;
  isDestroyed(): boolean;
  destroy(): void;
}

export interface IslandPorts {
  hub: Pick<RecordingStateHub, 'current' | 'elapsed' | 'subscribe'>;
  /** Where the island goes on the current screens; null when no screen can hold it. */
  layout(): Promise<IslandLayout | null>;
  openWindow(layout: IslandLayout): IslandWindowPort;
  startHover(area: () => HoverArea | null, onChange: (expanded: boolean) => void): IslandHover;
  /** « Ouvrir SayBack ». */
  openApp(): void;
  /** Sent to the main page, which owns the capture. */
  request(request: RecordingRequest): void;
}

export interface Island {
  /** The island window while it exists, for the IPC roles. */
  window(): IslandWindowPort | null;
  /** The page has loaded: shows the window and returns what to draw. */
  ready(): IslandSnapshot;
  request(request: IslandRequest): void;
  level(level: number): void;
  screensChanged(): Promise<void>;
  close(): void;
}

// Lives with the recording: created when it starts, destroyed when it ends.
export function createIsland(ports: IslandPorts): Island {
  let window: IslandWindowPort | null = null;
  let layout: IslandLayout | null = null;
  let hover: IslandHover | null = null;
  let expanded = false;
  let opening = false;

  const alive = () => (window && !window.isDestroyed() ? window : null);

  function snapshot(): IslandSnapshot | null {
    if (!layout) return null;
    const { state } = ports.hub.current();
    // The elapsed time at sending: the page counts on from its own reception.
    const recording = state.recording ? { ...state, elapsed: ports.hub.elapsed() } : state;
    return { recording, expanded, shape: layout.shape };
  }

  function send(channel: string, payload: unknown): void {
    const target = alive();
    if (target && !target.webContents.isDestroyed()) target.webContents.send(channel, payload);
  }

  function setExpanded(next: boolean): void {
    expanded = next;
    // Closed, every click goes through to what lies under the island.
    alive()?.setIgnoreMouseEvents(!next);
    send('island:expanded', next);
  }

  async function open(): Promise<void> {
    opening = true;
    try {
      const next = await ports.layout();
      if (!next || !ports.hub.current().state.recording) return;
      layout = next;
      window = ports.openWindow(next);
      window.setIgnoreMouseEvents(true);
      hover = ports.startHover(
        () => layout && { compact: layout.compact, open: layout.open },
        setExpanded,
      );
    } finally {
      opening = false;
    }
  }

  function close(): void {
    hover?.stop();
    hover = null;
    alive()?.destroy();
    window = null;
    layout = null;
    expanded = false;
  }

  function follow({ state }: RecordingSnapshot): void {
    if (!state.recording) return close();
    if (window) return send('island:state', snapshot());
    if (!opening) void open();
  }

  ports.hub.subscribe(follow);

  return {
    window: alive,
    ready() {
      const target = alive();
      const current = snapshot();
      if (!target || !layout || !current) throw new Error('L’îlot n’est pas affiché.');
      target.showInactive();
      // Placed again once shown: macOS may have pushed a new window below the menu bar.
      target.setBounds(layout.window);
      return current;
    },
    request(request) {
      if (request === 'open') ports.openApp();
      else ports.request(request);
    },
    level: (level) => send('island:level', level),
    async screensChanged() {
      if (!alive()) return;
      const next = await ports.layout();
      const target = alive();
      if (!next || !target) return;
      layout = next;
      target.setBounds(next.window);
      send('island:state', snapshot());
    },
    close,
  };
}

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
