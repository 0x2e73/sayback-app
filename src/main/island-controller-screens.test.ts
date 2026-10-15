import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingStartOutcome } from '../shared/recording-start';
import { ISLAND_SETTLE } from './island-controller';
import {
  fixture,
  lastState,
  layout,
  opened,
  readyOf,
  running,
  screens,
  start,
} from './island-controller.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the screen line of the ready island', () => {
  it('trusts listed screens over a denied permission', async () => {
    const setup = fixture();
    setup.ports.ready.screenPermission.mockReturnValue('denied');
    setup.island.toggle();
    await vi.advanceTimersByTimeAsync(0);
    expect(readyOf(setup.island.ready()).error).toBeNull();
    expect(setup.hover.held()).toBe(false);
  });

  it('says the screen is refused when none is listed and the permission is denied', async () => {
    const setup = fixture();
    setup.ports.ready.screenPermission.mockReturnValue('denied');
    setup.ports.ready.screens.mockResolvedValue([]);
    setup.island.toggle();
    await vi.advanceTimersByTimeAsync(0);
    expect(readyOf(setup.island.ready())).toMatchObject({
      screen: null,
      screenCount: 0,
      error: 'screen-denied',
    });
    expect(setup.hover.held()).toBe(true);
  });

  it('holds open on a screen missing after « Changer », and lets go once one is back', async () => {
    const { island, ports, hover, opened: current } = await opened();
    ports.ready.screens.mockResolvedValueOnce([]);
    island.request('cycle-screen');
    await vi.advanceTimersByTimeAsync(0);
    expect(readyOf(lastState(current().sent)).error).toBe('no-screen');
    expect(hover.held()).toBe(true);
    island.request('cycle-screen');
    await vi.advanceTimersByTimeAsync(0);
    expect(readyOf(lastState(current().sent))).toMatchObject({ error: null, screenCount: 2 });
    expect(hover.held()).toBe(false);
  });

  it('keeps its screen when the screens change, and falls back when it goes', async () => {
    const { island, ports, opened: current } = await opened();
    island.request('cycle-screen');
    await vi.advanceTimersByTimeAsync(0);
    const third = { id: 'screen:3:0', name: 'Écran 3' };
    ports.ready.screens.mockResolvedValueOnce([...screens, third]);
    await island.screensChanged();
    expect(readyOf(lastState(current().sent))).toMatchObject({
      screen: { id: 'screen:2:0' },
      screenCount: 3,
    });
    ports.ready.screens.mockResolvedValueOnce([screens[0]!, third]);
    await island.screensChanged();
    expect(readyOf(lastState(current().sent)).screen?.id).toBe('screen:1:0');
    expect(ports.layout).toHaveBeenCalledTimes(3);
  });

  it('keeps a start error when the screens change', async () => {
    const { island, ports, opened: current } = await opened();
    ports.ready.start.mockResolvedValueOnce({ ok: false, error: 'failed' });
    island.request(start);
    await vi.advanceTimersByTimeAsync(0);
    await island.screensChanged();
    expect(readyOf(lastState(current().sent)).error).toBe('failed');
  });
});

describe('the ready island around a start', () => {
  it('drops the previous error as soon as a new start begins', async () => {
    const { island, ports } = await opened();
    ports.ready.start.mockResolvedValueOnce({ ok: false, error: 'failed' });
    island.request(start);
    await vi.advanceTimersByTimeAsync(0);
    ports.ready.start.mockReturnValueOnce(new Promise<RecordingStartOutcome>(() => {}));
    island.request(start);
    expect(readyOf(island.ready()).error).toBeNull();
  });

  it('ignores its × while a start is busy, and takes it afterwards', async () => {
    const { island, ports } = await opened();
    let answer: (outcome: RecordingStartOutcome) => void = () => {};
    ports.ready.start.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    island.request(start);
    island.request('close');
    expect(island.window()).not.toBeNull();
    answer({ ok: false, error: 'failed' });
    await vi.advanceTimersByTimeAsync(0);
    island.request('close');
    expect(island.window()).toBeNull();
  });

  it('lets a failed opening go without leaving its session holding', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setup = fixture();
    setup.ports.ready.screens.mockResolvedValue([]);
    setup.ports.layout.mockRejectedValueOnce(new Error('screen gone'));
    setup.island.toggle();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(report).toHaveBeenCalledOnce();
    setup.island.toggle();
    await vi.advanceTimersByTimeAsync(0);
    expect(setup.ports.openWindow).toHaveBeenCalledWith(layout);
    report.mockRestore();
  });
});

describe('the icon during a recording whose island is not there yet', () => {
  it('opens the recording island and expands it', async () => {
    const { hub, island, ports, hover } = fixture();
    ports.layout.mockResolvedValueOnce(null);
    hub.publish(running);
    await vi.advanceTimersByTimeAsync(ISLAND_SETTLE);
    expect(ports.openWindow).not.toHaveBeenCalled();
    island.toggle();
    await vi.advanceTimersByTimeAsync(ISLAND_SETTLE);
    expect(ports.openWindow).toHaveBeenCalledOnce();
    expect(hover.expand).toHaveBeenCalledOnce();
  });
});
