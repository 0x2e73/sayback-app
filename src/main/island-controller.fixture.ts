import { vi } from 'vitest';
import type { CapturePrefs } from '../shared/contracts';
import type { RecordingState } from '../shared/recording-state';
import type { RecordingStartOutcome } from '../shared/recording-start';
import { createIsland, ISLAND_SETTLE } from './island-controller';
import type { IslandLayout } from './island-geometry';
import type { HoverOptions, IslandWindowPort } from './island-ports';
import type { ListedScreen } from './island-ready';
import { createRecordingStateHub } from './recording-state-hub';

/** Test support for the island controller: fake window, hover and ports. */
export const layout: IslandLayout = {
  displayId: 1,
  window: { x: 600, y: 0, width: 600, height: 280 },
  compact: { x: 706, y: 0, width: 388, height: 38 },
  open: { x: 620, y: 0, width: 560, height: 240 },
  shape: {
    kind: 'notch',
    barHeight: 38,
    notchWidth: 220,
    compactWidth: 388,
    openWidth: 560,
    openHeight: 240,
  },
};
export const running: Extract<RecordingState, { recording: true }> = {
  recording: true,
  elapsed: 10,
  paused: false,
  stopping: false,
};
export const screens: ListedScreen[] = [
  { id: 'screen:1:0', name: 'Écran 1', primary: true },
  { id: 'screen:2:0', name: 'Écran 2' },
];
export const prefs: CapturePrefs = {
  microphone: true,
  systemAudio: true,
  screen: true,
  autoAnalyze: true,
};

export function fakeWindow() {
  let destroyed = false;
  const sent: [string, unknown][] = [];
  const crash = { listener: () => {} };
  const window = {
    webContents: {
      mainFrame: {},
      send: (channel: string, payload: unknown) => sent.push([channel, payload]),
      isDestroyed: () => destroyed,
      on: (_event: 'render-process-gone', listener: () => void) => (crash.listener = listener),
    },
    showInactive: vi.fn(),
    getMediaSourceId: () => 'window:99:0',
    setBounds: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    isDestroyed: () => destroyed,
    destroy: vi.fn(() => {
      destroyed = true;
    }),
  } satisfies IslandWindowPort;
  return { window, sent, crash: () => crash.listener() };
}

function fakeHover() {
  const hover = {
    options: null as HoverOptions | null,
    stop: vi.fn(),
    expand: vi.fn(),
    area: () => hover.options?.area() ?? null,
    change: (open: boolean) => hover.options?.onChange(open),
    held: () => hover.options?.hold?.() ?? false,
  };
  return hover;
}

function readyPorts() {
  return {
    prefs: vi.fn(() => prefs),
    screens: vi.fn(async () => screens),
    screenPermission: vi.fn((): 'granted' | 'denied' => 'granted'),
    today: () => new Date(2026, 9, 15, 11, 0),
    start: vi.fn(async (): Promise<RecordingStartOutcome> => ({ ok: true })),
  };
}

export function fixture(nextLayout: IslandLayout | null = layout) {
  let time = 0;
  const hub = createRecordingStateHub(() => time);
  let opened = fakeWindow();
  const hover = fakeHover();
  const ports = {
    hub,
    layout: vi.fn(async () => nextLayout),
    openWindow: vi.fn(() => {
      opened = fakeWindow();
      return opened.window;
    }),
    startHover: vi.fn((options: HoverOptions) => {
      hover.options = options;
      return { stop: hover.stop, expand: hover.expand };
    }),
    ready: readyPorts(),
    openApp: vi.fn(),
    openDialog: vi.fn(),
    openPrivacySettings: vi.fn(),
    request: vi.fn(),
  };
  const island = createIsland(ports);
  const settle = () => vi.advanceTimersByTimeAsync(ISLAND_SETTLE);
  const start = async (state: RecordingState = running) => {
    hub.publish(state);
    await settle();
  };
  return {
    hub,
    island,
    ports,
    hover,
    start,
    settle,
    opened: () => opened,
    advance: (ms: number) => (time += ms),
  };
}
