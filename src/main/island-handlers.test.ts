import { describe, expect, it, vi } from 'vitest';
import type { RecordingState } from '../shared/recording-state';
import { createIsland, registerIslandHandlers, type IslandWindowPort } from './island-handlers';
import type { IslandLayout } from './island-geometry';
import type { HoverArea } from './island-hover';
import type { IpcRegistrar } from './ipc';
import { createRecordingStateHub } from './recording-state-hub';
import type { WindowRole } from './window-roles';

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
  const window = {
    webContents: {
      mainFrame: {},
      send: (channel: string, payload: unknown) => sent.push([channel, payload]),
      isDestroyed: () => destroyed,
    },
    showInactive: vi.fn(),
    setBounds: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    isDestroyed: () => destroyed,
    destroy: vi.fn(() => {
      destroyed = true;
    }),
  } satisfies IslandWindowPort;
  return { window, sent };
}

function fixture(nextLayout: IslandLayout | null = layout) {
  let time = 0;
  const hub = createRecordingStateHub(() => time);
  const opened = fakeWindow();
  const hover: {
    stop: () => void;
    area(): HoverArea | null;
    change(expanded: boolean): void;
  } = { stop: vi.fn(), area: () => null, change: () => {} };
  const ports = {
    hub,
    layout: vi.fn(async () => nextLayout),
    openWindow: vi.fn(() => opened.window),
    startHover: vi.fn((area: () => HoverArea | null, onChange: (expanded: boolean) => void) => {
      hover.area = area;
      hover.change = onChange;
      return { stop: hover.stop };
    }),
    openApp: vi.fn(),
    request: vi.fn(),
  };
  const island = createIsland(ports);
  const start = async (state: RecordingState = running) => {
    hub.publish(state);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { hub, island, ports, opened, hover, start, advance: (ms: number) => (time += ms) };
}

describe('createIsland', () => {
  it('opens a window that lets clicks through when a recording starts', async () => {
    const { ports, opened, start } = fixture();
    await start();
    expect(ports.openWindow).toHaveBeenCalledWith(layout);
    expect(opened.window.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
    expect(opened.window.showInactive).not.toHaveBeenCalled();
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
    expect(opened.window.showInactive).toHaveBeenCalledOnce();
    expect(opened.window.setBounds).toHaveBeenCalledWith(layout.window);
  });

  it('sends every later state with the elapsed time at sending', async () => {
    const { hub, opened, start } = fixture();
    await start();
    hub.publish({ ...running, elapsed: 20, paused: true });
    expect(opened.sent.at(-1)).toEqual([
      'island:state',
      {
        recording: { ...running, elapsed: 20, paused: true },
        expanded: false,
        shape: layout.shape,
      },
    ]);
  });

  it('opens and closes with the hover, catching clicks only while open', async () => {
    const { hover, opened, start } = fixture();
    await start();
    expect(hover.area()).toEqual({ compact: layout.compact, open: layout.open });
    hover.change(true);
    expect(opened.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(opened.sent.at(-1)).toEqual(['island:expanded', true]);
    hover.change(false);
    expect(opened.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);
  });

  it('relays the level, and the pause, resume, stop and open requests', async () => {
    const { island, ports, opened, start } = fixture();
    await start();
    island.level(0.3);
    expect(opened.sent.at(-1)).toEqual(['island:level', 0.3]);
    island.request('pause');
    island.request('stop');
    island.request('open');
    expect(ports.request.mock.calls).toEqual([['pause'], ['stop']]);
    expect(ports.openApp).toHaveBeenCalledOnce();
  });

  it('is destroyed with its hover when the recording ends', async () => {
    const { hub, island, hover, opened, start } = fixture();
    await start();
    hub.publish({ recording: false });
    expect(opened.window.destroy).toHaveBeenCalledOnce();
    expect(hover.stop).toHaveBeenCalledOnce();
    expect(island.window()).toBeNull();
    expect(() => island.ready()).toThrow();
  });

  it('opens no window when the recording ended while the screens were read', async () => {
    const { hub, ports } = fixture();
    hub.publish(running);
    hub.publish({ recording: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(ports.openWindow).not.toHaveBeenCalled();
  });

  it('opens no window when no screen can hold it', async () => {
    const { ports, start } = fixture(null);
    await start();
    expect(ports.openWindow).not.toHaveBeenCalled();
  });

  it('moves to the new place when the screens change', async () => {
    const { island, ports, opened, start } = fixture();
    await start();
    const moved = { ...layout, window: { ...layout.window, x: 10 } };
    ports.layout.mockResolvedValueOnce(moved);
    await island.screensChanged();
    expect(opened.window.setBounds).toHaveBeenLastCalledWith(moved.window);
    expect(opened.sent.at(-1)?.[0]).toBe('island:state');
  });

  it('ignores the screens at rest', async () => {
    const { island, ports } = fixture();
    await island.screensChanged();
    expect(ports.layout).not.toHaveBeenCalled();
  });
});

describe('registerIslandHandlers', () => {
  function registered(shown = true) {
    const shownWindow = fakeWindow().window;
    const roles = new Map<string, readonly WindowRole[] | undefined>();
    const actions = new Map<string, (...args: unknown[]) => unknown>();
    const registrar: IpcRegistrar = {
      handle: (channel, action, allowed) => {
        roles.set(channel, allowed);
        actions.set(channel, action);
      },
      listen: (channel, action, allowed) => {
        roles.set(channel, allowed);
        actions.set(channel, action);
      },
    };
    const island = {
      window: () => (shown ? shownWindow : null),
      ready: vi.fn(),
      request: vi.fn(),
      level: vi.fn(),
      screensChanged: vi.fn(),
      close: vi.fn(),
    };
    registerIslandHandlers(registrar, island);
    return { roles, actions, island };
  }

  it('gives the island its two channels and the main page the level only', () => {
    const { roles } = registered();
    expect(Object.fromEntries(roles)).toEqual({
      'island:ready': ['island'],
      'island:request': ['island'],
      'live:level': ['main'],
    });
  });

  it.each(['pause', 'resume', 'stop', 'open'])('passes the %s request on', (request) => {
    const { actions, island } = registered();
    actions.get('island:request')?.(request);
    expect(island.request).toHaveBeenCalledWith(request);
  });

  it.each(['start', '', 3, null, { request: 'stop' }])('refuses the %j request', (request) => {
    const { actions, island } = registered();
    expect(() => actions.get('island:request')?.(request)).toThrow();
    expect(island.request).not.toHaveBeenCalled();
  });

  it('passes a valid level to the island', () => {
    const { actions, island } = registered();
    actions.get('live:level')?.(0.5);
    expect(island.level).toHaveBeenCalledWith(0.5);
  });

  it('ignores the level while there is no island', () => {
    const { actions, island } = registered(false);
    expect(() => actions.get('live:level')?.(0.5)).not.toThrow();
    expect(island.level).not.toHaveBeenCalled();
  });

  it.each([-0.1, 1.5, Number.NaN, '0.5', null])('drops the level %j', (level) => {
    const { actions, island } = registered();
    expect(() => actions.get('live:level')?.(level)).toThrow();
    expect(island.level).not.toHaveBeenCalled();
  });
});
