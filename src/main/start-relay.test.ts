import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StartPayload } from '../shared/recording-start';
import type { RegisterHandler } from './ipc';
import {
  ANSWER_TIMEOUT,
  createStartRelay,
  READY_TIMEOUT,
  registerStartRelay,
  type RelayWindow,
} from './start-relay';

const payload: StartPayload = {
  title: 'Réunion du 15 octobre, 11 h 00',
  selection: { microphone: true, systemAudio: true, screen: true, screenId: 'screen:1:0' },
};

function fakeWindow(loading = false) {
  return { webContents: { isLoading: () => loading, send: vi.fn() } } satisfies RelayWindow;
}

function setup(initial: RelayWindow | null) {
  let current = initial;
  const hidden = fakeWindow(true);
  const openHiddenWindow = vi.fn(() => {
    current = hidden;
    return hidden;
  });
  const relay = createStartRelay({
    getWindow: () => current,
    openHiddenWindow,
    newId: () => 'start-1',
  });
  return { relay, hidden, openHiddenWindow };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createStartRelay', () => {
  it('hands the start to a listening page, as it is, and returns its answer', async () => {
    const window = fakeWindow();
    const { relay, openHiddenWindow } = setup(window);
    const outcome = relay.start(payload);
    await vi.advanceTimersByTimeAsync(0);
    expect(window.webContents.send).toHaveBeenCalledWith('recording:start-request', {
      id: 'start-1',
      ...payload,
    });
    relay.answer({ id: 'start-1', outcome: { ok: false, error: 'screen-denied' } });
    await expect(outcome).resolves.toEqual({ ok: false, error: 'screen-denied' });
    expect(openHiddenWindow).not.toHaveBeenCalled();
  });

  it('opens a hidden window when there is none and waits for its page', async () => {
    const { relay, hidden, openHiddenWindow } = setup(null);
    const outcome = relay.start(payload);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(openHiddenWindow).toHaveBeenCalledOnce();
    expect(hidden.webContents.send).not.toHaveBeenCalled();
    relay.rendererReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(hidden.webContents.send).toHaveBeenCalledOnce();
    relay.answer({ id: 'start-1', outcome: { ok: true } });
    await expect(outcome).resolves.toEqual({ ok: true });
  });

  it('fails when the page never says it listens', async () => {
    const { relay, hidden } = setup(fakeWindow(true));
    const outcome = relay.start(payload);
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT);
    await expect(outcome).resolves.toEqual({ ok: false, error: 'failed' });
    expect(hidden.webContents.send).not.toHaveBeenCalled();
  });

  it('fails when the page never answers, and drops the late answer', async () => {
    const { relay } = setup(fakeWindow());
    const outcome = relay.start(payload);
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT);
    await expect(outcome).resolves.toEqual({ ok: false, error: 'failed' });
    expect(() => relay.answer({ id: 'start-1', outcome: { ok: true } })).not.toThrow();
  });

  it('fails when no window can be opened', async () => {
    const relay = createStartRelay({ getWindow: () => null, openHiddenWindow: () => null });
    await expect(relay.start(payload)).resolves.toEqual({ ok: false, error: 'failed' });
  });

  it('fails when the page cannot be reached', async () => {
    const window = fakeWindow();
    window.webContents.send.mockImplementation(() => {
      throw new Error('destroyed');
    });
    await expect(setup(window).relay.start(payload)).resolves.toEqual({
      ok: false,
      error: 'failed',
    });
  });

  it.each([
    null,
    {},
    { id: 'start-1' },
    { id: 'start-1', outcome: { ok: false } },
    { id: 'start-1', outcome: { ok: false, error: 'boom' } },
    { id: 'start-1', outcome: { ok: true }, extra: 1 },
  ])('refuses the answer %j', (answer) => {
    expect(() => setup(fakeWindow()).relay.answer(answer)).toThrow();
  });
});

describe('registerStartRelay', () => {
  it('takes the answer from the main page only, with a rate limit', () => {
    const handle = vi.fn<RegisterHandler>();
    registerStartRelay(handle, setup(null).relay);
    expect(handle).toHaveBeenCalledWith(
      'recording:start-result',
      expect.any(Function),
      ['main'],
      5,
    );
  });
});
