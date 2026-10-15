import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingStartOutcome } from '../shared/recording-start';
import { BLUR_TOGGLE_GUARD, CLICK_GUARD, FOLD_FALLBACK } from './island-controller';
import { fixture, opened, running, start } from './island-controller.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function busy() {
  const setup = await opened();
  setup.island.ready();
  setup.ports.ready.start.mockReturnValueOnce(new Promise<RecordingStartOutcome>(() => {}));
  setup.island.request(start);
  return setup;
}

describe('the ready island takes the keyboard', () => {
  it('becomes focusable and is focused once shown', async () => {
    const { island, opened: current } = await opened();
    const { window } = current();
    expect(window.focus).not.toHaveBeenCalled();
    island.ready();
    expect(window.setFocusable).toHaveBeenLastCalledWith(true);
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it('folds away when it loses the keyboard to a click elsewhere', async () => {
    const { island, opened: current } = await opened();
    island.ready();
    const first = current();
    first.blur();
    expect(island.window()).toBeNull();
    expect(first.sent.at(-1)).toEqual(['island:expanded', false]);
    vi.advanceTimersByTime(FOLD_FALLBACK);
    expect(first.window.destroy).toHaveBeenCalledOnce();
  });

  it('stays while a start is busy, whatever takes the keyboard', async () => {
    const { island, opened: current } = await busy();
    current().blur();
    island.request('close');
    expect(island.window()).not.toBeNull();
  });

  it('treats the icon click that blurred it as a close, not a reopening', async () => {
    const { island, ports, opened: current } = await opened();
    island.ready();
    current().blur();
    island.toggle();
    await vi.advanceTimersByTimeAsync(0);
    expect(ports.openWindow).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(BLUR_TOGGLE_GUARD);
    island.toggle();
    await vi.advanceTimersByTimeAsync(0);
    expect(ports.openWindow).toHaveBeenCalledTimes(2);
  });
});

describe('the recording island never takes the keyboard', () => {
  it('stops being focusable when the ready island becomes the recording one', async () => {
    const { hub, island, opened: current } = await opened();
    island.ready();
    hub.publish(running);
    expect(current().window.setFocusable).toHaveBeenLastCalledWith(false);
    current().blur();
    island.request('close');
    expect(island.window()).not.toBeNull();
  });

  it('is never made focusable when it opens with the recording', async () => {
    const { island, opened: current, start: record } = fixture();
    await record();
    island.ready();
    expect(current().window.setFocusable).not.toHaveBeenCalled();
    expect(current().window.focus).not.toHaveBeenCalled();
  });
});

describe('the closed recording island', () => {
  it('takes clicks only while the cursor is within reach of its wings', async () => {
    const { hover, opened: current, start: record } = fixture();
    await record();
    const { window } = current();
    hover.reach(true);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    hover.reach(false);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);
  });

  it('opens on a click on its wings, not on the ready island', async () => {
    const recording = fixture();
    await recording.start();
    recording.island.request('expand');
    expect(recording.hover.expand).toHaveBeenCalledOnce();
    const ready = await opened();
    ready.island.request('expand');
    expect(ready.hover.expand).not.toHaveBeenCalled();
  });

  it('leaves the clicks to the open island once open, whatever the reach says', async () => {
    const { hover, opened: current, start: record } = fixture();
    await record();
    hover.change(true);
    vi.advanceTimersByTime(CLICK_GUARD);
    hover.reach(false);
    expect(current().window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  });

  it('folds back once the recording is stopping', async () => {
    const { hub, hover, start: record } = fixture();
    await record();
    hub.publish({ ...running, stopping: true });
    expect(hover.collapse).toHaveBeenCalledOnce();
  });
});
