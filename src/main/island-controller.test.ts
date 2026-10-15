import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingState } from '../shared/recording-state';
import {
  CLICK_GUARD,
  createIsland,
  ISLAND_SETTLE,
  type IslandWindowPort,
} from './island-controller';
import type { IslandLayout } from './island-geometry';
import type { HoverArea } from './island-hover';
import { createRecordingStateHub } from './recording-state-hub';

const layout: IslandLayout = {
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
const running: RecordingState = { recording: true, elapsed: 10, paused: false, stopping: false };

function fakeWindow() {
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

function fixture(nextLayout: IslandLayout | null = layout) {
  let time = 0;
  const hub = createRecordingStateHub(() => time);
  let opened = fakeWindow();
  const hover: { stop: () => void; area(): HoverArea | null; change(open: boolean): void } = {
    stop: vi.fn(),
    area: () => null,
    change: () => {},
  };
  const ports = {
    hub,
    layout: vi.fn(async () => nextLayout),
    openWindow: vi.fn(() => {
      opened = fakeWindow();
      return opened.window;
    }),
    startHover: vi.fn((area: () => HoverArea | null, onChange: (open: boolean) => void) => {
      hover.area = area;
      hover.change = onChange;
      return { stop: hover.stop };
    }),
    openApp: vi.fn(),
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

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createIsland', () => {
  it('opens a window that lets clicks through once a recording has started', async () => {
    const { ports, opened, start } = fixture();
    await start();
    expect(ports.openWindow).toHaveBeenCalledWith(layout);
    expect(opened().window.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
    expect(opened().window.showInactive).not.toHaveBeenCalled();
  });

  it('opens or closes the window once when the state flips in a burst', async () => {
    const { hub, ports, settle } = fixture();
    hub.publish(running);
    hub.publish({ recording: false });
    hub.publish(running);
    await settle();
    expect(ports.openWindow).toHaveBeenCalledOnce();
    hub.publish({ recording: false });
    hub.publish(running);
    await settle();
    expect(ports.openWindow).toHaveBeenCalledOnce();
  });

  it('shows itself without focus once its page is ready, then returns what to draw', async () => {
    const { island, opened, start, advance } = fixture();
    await start();
    advance(3_000);
    expect(island.ready()).toEqual({
      recording: { ...running, elapsed: 13 },
      expanded: false,
      shape: layout.shape,
    });
    expect(opened().window.showInactive).toHaveBeenCalledOnce();
    expect(opened().window.setBounds).toHaveBeenCalledWith(layout.window);
  });

  it('sends every later state at once, with the elapsed time at sending', async () => {
    const { hub, opened, start } = fixture();
    await start();
    hub.publish({ ...running, elapsed: 20, paused: true });
    expect(opened().sent.at(-1)).toEqual([
      'island:state',
      {
        recording: { ...running, elapsed: 20, paused: true },
        expanded: false,
        shape: layout.shape,
      },
    ]);
  });

  it('opens on the visible shell only, never on the whole transparent window', async () => {
    const { hover, start } = fixture();
    await start();
    expect(hover.area()).toEqual({ compact: layout.compact, open: layout.open });
    expect(hover.area()?.open).not.toEqual(layout.window);
  });

  it('takes clicks only once the opening animation is over, and none once closed', async () => {
    const { hover, opened, start } = fixture();
    await start();
    const { window, sent } = opened();
    hover.change(true);
    expect(sent.at(-1)).toEqual(['island:expanded', true]);
    expect(window.setIgnoreMouseEvents).not.toHaveBeenCalledWith(false);
    vi.advanceTimersByTime(CLICK_GUARD - 1);
    expect(window.setIgnoreMouseEvents).not.toHaveBeenCalledWith(false);
    vi.advanceTimersByTime(1);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    hover.change(false);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);
  });

  it('keeps ignoring clicks when it closes again during the animation', async () => {
    const { hover, opened, start } = fixture();
    await start();
    hover.change(true);
    hover.change(false);
    vi.advanceTimersByTime(CLICK_GUARD);
    expect(opened().window.setIgnoreMouseEvents).not.toHaveBeenCalledWith(false);
  });

  it('relays the level, and the pause, resume, stop and open requests', async () => {
    const { island, ports, opened, start } = fixture();
    await start();
    island.level(0.3);
    expect(opened().sent.at(-1)).toEqual(['island:level', 0.3]);
    island.request('pause');
    island.request('stop');
    island.request('open');
    expect(ports.request.mock.calls).toEqual([['pause'], ['stop']]);
    expect(ports.openApp).toHaveBeenCalledOnce();
  });

  it('is destroyed with its hover once the recording has ended', async () => {
    const { hub, island, hover, opened, settle, start } = fixture();
    await start();
    hub.publish({ recording: false });
    await settle();
    expect(opened().window.destroy).toHaveBeenCalledOnce();
    expect(hover.stop).toHaveBeenCalledOnce();
    expect(island.window()).toBeNull();
    expect(() => island.ready()).toThrow();
  });

  it('closes when its page crashes, and the next state opens a new one', async () => {
    const { hub, island, ports, opened, settle, start } = fixture();
    await start();
    const first = opened();
    first.crash();
    expect(first.window.destroy).toHaveBeenCalledOnce();
    expect(island.window()).toBeNull();
    hub.publish({ ...running, elapsed: 12 });
    await settle();
    expect(ports.openWindow).toHaveBeenCalledTimes(2);
  });

  it('opens no window when the recording ended while the screens were read', async () => {
    const { hub, ports, settle } = fixture();
    let resolve: (value: IslandLayout) => void = () => {};
    ports.layout.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    hub.publish(running);
    await settle();
    hub.publish({ recording: false });
    resolve(layout);
    await settle();
    expect(ports.openWindow).not.toHaveBeenCalled();
  });

  it('opens no window when no screen can hold it', async () => {
    const { ports, start } = fixture(null);
    await start();
    expect(ports.openWindow).not.toHaveBeenCalled();
  });

  it('logs a failed opening instead of leaving it unhandled', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ports, start } = fixture();
    ports.layout.mockRejectedValueOnce(new Error('screen gone'));
    await start();
    expect(report).toHaveBeenCalledOnce();
    report.mockRestore();
  });

  it('moves to the new place when the screens change', async () => {
    const { island, ports, opened, start } = fixture();
    await start();
    const moved = { ...layout, window: { ...layout.window, x: 10 } };
    ports.layout.mockResolvedValueOnce(moved);
    await island.screensChanged();
    expect(opened().window.setBounds).toHaveBeenLastCalledWith(moved.window);
    expect(opened().sent.at(-1)?.[0]).toBe('island:state');
  });

  it('reads the screens again when they changed while the window was opening', async () => {
    const { hub, island, ports, opened, settle } = fixture();
    const moved = { ...layout, window: { ...layout.window, x: 10 } };
    let resolve: (value: IslandLayout) => void = () => {};
    ports.layout.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    ports.layout.mockResolvedValueOnce(moved);
    hub.publish(running);
    await settle();
    await island.screensChanged();
    resolve(layout);
    await settle();
    expect(ports.layout).toHaveBeenCalledTimes(2);
    expect(opened().window.setBounds).toHaveBeenLastCalledWith(moved.window);
  });

  it('ignores the screens at rest', async () => {
    const { island, ports } = fixture();
    await island.screensChanged();
    expect(ports.layout).not.toHaveBeenCalled();
  });
});
