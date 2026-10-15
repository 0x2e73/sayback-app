import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingStartOutcome } from '../shared/recording-start';
import { CLICK_GUARD, FOLD_FALLBACK } from './island-controller';
import {
  fixture,
  lastState,
  layout,
  opened,
  prefs,
  readyOf,
  running,
  screens,
  start,
} from './island-controller.fixture';
import { READY_ERROR_HOLD, READY_HOVER, RECORDING_HOVER } from './island-hover';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the ready island', () => {
  it('opens expanded on a click of the icon, with what to start from', async () => {
    const { island, ports } = await opened();
    expect(ports.openWindow).toHaveBeenCalledWith(layout);
    expect(island.ready()).toEqual({
      mode: 'ready',
      recording: { recording: false },
      expanded: true,
      shape: layout.shape,
      ready: {
        title: 'Réunion du 15 octobre, 11 h 00',
        remembered: { microphone: true, systemAudio: true, screen: true },
        screen: { id: 'screen:1:0', name: 'Écran 1' },
        screenCount: 2,
        error: null,
      },
    });
  });

  it('shows itself without focus and takes clicks once its opening is over', async () => {
    const { island, opened: current } = await opened();
    island.ready();
    const { window } = current();
    expect(window.showInactive).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(CLICK_GUARD - 1);
    expect(window.setIgnoreMouseEvents).not.toHaveBeenCalledWith(false);
    vi.advanceTimersByTime(1);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  });

  it('follows the ready close rules: open, never entered, 3 s and 15 s', async () => {
    const { hover } = await opened();
    expect(hover.options).toMatchObject({
      delays: READY_HOVER,
      initial: { expanded: true, entered: false },
    });
    expect(READY_HOVER).toMatchObject({ close: 3_000, untouched: 15_000 });
  });

  it('folds then goes on a second click, and comes back fresh on the next', async () => {
    const { island, ports, opened: current } = await opened();
    const first = current();
    island.toggle();
    expect(island.window()).toBeNull();
    expect(first.sent.at(-1)).toEqual(['island:expanded', false]);
    expect(first.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(FOLD_FALLBACK - 1);
    expect(first.window.destroy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(first.window.destroy).toHaveBeenCalledOnce();
    ports.ready.prefs.mockReturnValue({ ...prefs, screen: false, systemAudio: false });
    island.toggle();
    await vi.advanceTimersByTimeAsync(0);
    expect(ports.openWindow).toHaveBeenCalledTimes(2);
    expect(ports.ready.screens).toHaveBeenCalledTimes(2);
    expect(readyOf(island.ready()).remembered).toEqual({
      microphone: true,
      systemAudio: false,
      screen: false,
    });
  });

  it('closes when the hover says the cursor left, and on its ×', async () => {
    const first = await opened();
    first.hover.change(false);
    expect(first.island.window()).toBeNull();
    const second = await opened();
    second.island.request('close');
    expect(second.island.window()).toBeNull();
  });

  it('opens the dialog from « Ouvrir SayBack » and closes', async () => {
    const { island, ports } = await opened();
    island.request('open');
    expect(ports.openDialog).toHaveBeenCalledOnce();
    expect(ports.openApp).not.toHaveBeenCalled();
    expect(island.window()).toBeNull();
  });

  it('opens the screen recording settings', async () => {
    const { island, ports } = await opened();
    island.request('open-privacy-settings');
    expect(ports.openPrivacySettings).toHaveBeenCalledOnce();
  });

  it('moves to the next screen and back to the first, listing them again', async () => {
    const { island, ports, opened: current } = await opened();
    island.request('cycle-screen');
    await vi.advanceTimersByTimeAsync(0);
    expect(readyOf(lastState(current().sent)).screen).toEqual({
      id: 'screen:2:0',
      name: 'Écran 2',
    });
    island.request('cycle-screen');
    await vi.advanceTimersByTimeAsync(0);
    expect(readyOf(lastState(current().sent)).screen?.id).toBe('screen:1:0');
    expect(ports.ready.screens).toHaveBeenCalledTimes(3);
  });
});

describe('starting from the ready island', () => {
  it('relays the start and holds the island open while it is busy', async () => {
    const { island, ports, hover, opened: current } = await opened();
    let answer: (outcome: RecordingStartOutcome) => void = () => {};
    ports.ready.start.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    island.request(start);
    island.request(start);
    expect(ports.ready.start).toHaveBeenCalledExactlyOnceWith({
      title: start.title,
      selection: start.selection,
    });
    expect(hover.held()).toBe(true);
    answer({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(hover.held()).toBe(false);
    expect(current().sent.at(-1)).toEqual(['island:start-result', { ok: true }]);
  });

  it('stays ready on failure, shows the error and holds open for 30 s', async () => {
    const { island, ports, hover, opened: current } = await opened();
    ports.ready.start.mockResolvedValueOnce({ ok: false, error: 'screen-denied' });
    island.request(start);
    await vi.advanceTimersByTimeAsync(0);
    expect(current().sent.at(-1)).toEqual([
      'island:start-result',
      { ok: false, error: 'screen-denied' },
    ]);
    expect(readyOf(island.ready()).error).toBe('screen-denied');
    vi.advanceTimersByTime(READY_ERROR_HOLD - 1);
    expect(hover.held()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hover.held()).toBe(false);
  });

  it('answers a start without any audio source at once, without relaying it', async () => {
    const { island, ports, opened: current } = await opened();
    const silent = { microphone: false, systemAudio: false, screen: true, screenId: 'screen:1:0' };
    island.request({ ...start, selection: silent });
    await vi.advanceTimersByTimeAsync(0);
    expect(ports.ready.start).not.toHaveBeenCalled();
    expect(current().sent.at(-1)).toEqual([
      'island:start-result',
      { ok: false, error: 'no-audio-source' },
    ]);
  });

  it('counts a relay that throws as a failure', async () => {
    const { island, ports, opened: current } = await opened();
    ports.ready.start.mockRejectedValueOnce(new Error('gone'));
    island.request(start);
    await vi.advanceTimersByTimeAsync(0);
    expect(current().sent.at(-1)).toEqual(['island:start-result', { ok: false, error: 'failed' }]);
  });

  it('drops the answer of a start once the island is closed', async () => {
    const { island, ports, opened: current } = await opened();
    let answer: (outcome: RecordingStartOutcome) => void = () => {};
    ports.ready.start.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    island.request(start);
    const first = current();
    island.toggle();
    answer({ ok: false, error: 'failed' });
    await vi.advanceTimersByTimeAsync(FOLD_FALLBACK);
    expect(first.sent.some(([channel]) => channel === 'island:start-result')).toBe(false);
  });

  it('becomes the recording island in the same window once the recording starts', async () => {
    const { hub, island, ports, hover, opened: current } = await opened();
    hub.publish(running);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ports.openWindow).toHaveBeenCalledOnce();
    expect(lastState(current().sent)?.mode).toBe('recording');
    expect(hover.options).toMatchObject({
      delays: RECORDING_HOVER,
      initial: { expanded: true, entered: true },
    });
    island.request('close');
    expect(island.window()).not.toBeNull();
  });

  it('drops a ready island still opening when a recording starts, and opens the recording one', async () => {
    const { hub, island, ports, settle } = fixture();
    let listed: (value: typeof screens) => void = () => {};
    ports.ready.screens.mockReturnValueOnce(new Promise((resolve) => (listed = resolve)));
    island.toggle();
    hub.publish(running);
    listed(screens);
    await settle();
    expect(ports.openWindow).toHaveBeenCalledOnce();
    expect(island.ready().mode).toBe('recording');
  });
});

describe('the icon during a recording', () => {
  it('opens the recording island instead of a ready one', async () => {
    const { island, ports, hover, start: record } = fixture();
    await record();
    island.toggle();
    expect(hover.expand).toHaveBeenCalledOnce();
    expect(ports.openWindow).toHaveBeenCalledOnce();
    expect(ports.ready.screens).not.toHaveBeenCalled();
  });
});
