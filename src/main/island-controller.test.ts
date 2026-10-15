import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLICK_GUARD } from './island-controller';
import { fixture, layout, running } from './island-controller.fixture';
import type { IslandLayout } from './island-geometry';
import { RECORDING_HOVER } from './island-hover';

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
      mode: 'recording',
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
        mode: 'recording',
      },
    ]);
  });

  it('opens on the visible shell only, never on the whole transparent window', async () => {
    const { hover, start } = fixture();
    await start();
    expect(hover.options).toMatchObject({
      delays: RECORDING_HOVER,
      initial: { expanded: false, entered: false },
    });
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
