import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StartPayload } from '../shared/recording-start';
import type { IpcRegistrar } from './ipc';
import {
  ACCEPT_TIMEOUT,
  createStartRelay,
  READY_TIMEOUT,
  registerStartRelay,
  RESULT_TIMEOUT,
  type RelayWindow,
} from './start-relay';

const payload: StartPayload = {
  title: 'Réunion du 15 octobre, 11 h 00',
  selection: { microphone: true, systemAudio: true, screen: true, screenId: 'screen:1:0' },
};
const NOW = 1_000_000;

function fakePage(options: { crashed?: boolean } = {}) {
  const listeners = new Map<string, (details?: unknown) => void>();
  let destroyed = false;
  const webContents = {
    isDestroyed: () => destroyed,
    isCrashed: () => options.crashed ?? false,
    reload: vi.fn(),
    send: vi.fn(),
    executeJavaScript: vi.fn(async () => undefined),
    on: (event: string, listener: (details?: unknown) => void) => listeners.set(event, listener),
  };
  const fire = (event: string, details?: unknown) => {
    if (event === 'destroyed') destroyed = true;
    listeners.get(event)?.(details);
  };
  return { window: { webContents } satisfies RelayWindow, webContents, fire };
}

function setup(initial: ReturnType<typeof fakePage> | null) {
  let current: RelayWindow | null = initial?.window ?? null;
  const hidden = fakePage();
  const openHiddenWindow = vi.fn(() => {
    current = hidden.window;
    return hidden.window;
  });
  const relay = createStartRelay({
    getWindow: () => current,
    openHiddenWindow,
    newId: () => 'start-1',
    now: () => Date.now(),
  });
  const close = () => (current = null);
  return { relay, hidden, openHiddenWindow, close };
}

/** A window whose page has subscribed. */
function listening() {
  const page = fakePage();
  const fixture = setup(page);
  fixture.relay.rendererReady();
  return { ...fixture, page };
}

const sent = { id: 'start-1', deadline: NOW + ACCEPT_TIMEOUT + RESULT_TIMEOUT, ...payload };
const failed = { ok: false, error: 'failed' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('handing the start to the page', () => {
  it('primes a user activation, sends the request with its deadline and returns the answer', async () => {
    const { relay, page, openHiddenWindow } = listening();
    const outcome = relay.start(payload);
    await vi.advanceTimersByTimeAsync(0);
    expect(page.webContents.executeJavaScript).toHaveBeenCalledWith('void 0', true);
    expect(page.webContents.send).toHaveBeenCalledWith('recording:start-request', sent);
    relay.answer({ id: 'start-1', outcome: { ok: false, error: 'screen-denied' } });
    await expect(outcome).resolves.toEqual({ ok: false, error: 'screen-denied' });
    expect(openHiddenWindow).not.toHaveBeenCalled();
  });

  it('fails when the activation cannot be primed', async () => {
    const { relay, page } = listening();
    page.webContents.executeJavaScript.mockRejectedValueOnce(new Error('gone'));
    await expect(relay.start(payload)).resolves.toEqual(failed);
    expect(page.webContents.send).not.toHaveBeenCalled();
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

  it('waits for a page that has never said it listens, then fails at the ready timeout', async () => {
    const page = fakePage();
    const { relay } = setup(page);
    const outcome = relay.start(payload);
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT);
    await expect(outcome).resolves.toEqual(failed);
    expect(page.webContents.send).not.toHaveBeenCalled();
  });

  it('reloads a crashed page and waits for it', async () => {
    const page = fakePage({ crashed: true });
    const { relay } = setup(page);
    const outcome = relay.start(payload);
    await vi.advanceTimersByTimeAsync(0);
    expect(page.webContents.reload).toHaveBeenCalledOnce();
    relay.rendererReady();
    await vi.advanceTimersByTimeAsync(0);
    relay.answer({ id: 'start-1', outcome: { ok: true } });
    await expect(outcome).resolves.toEqual({ ok: true });
  });

  it('fails when no window can be opened, or the page cannot be reached', async () => {
    const none = createStartRelay({ getWindow: () => null, openHiddenWindow: () => null });
    await expect(none.start(payload)).resolves.toEqual(failed);
    const { relay, page } = listening();
    page.webContents.send.mockImplementation(() => {
      throw new Error('destroyed');
    });
    await expect(relay.start(payload)).resolves.toEqual(failed);
  });
});

describe('the listening page', () => {
  it('stops listening when its top frame starts another document', async () => {
    const { relay, page } = listening();
    page.fire('did-start-navigation', { isMainFrame: true, isSameDocument: true });
    page.fire('did-start-navigation', { isMainFrame: false, isSameDocument: false });
    const first = relay.start(payload);
    await vi.advanceTimersByTimeAsync(0);
    expect(page.webContents.send).toHaveBeenCalledOnce();
    page.fire('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    await expect(first).resolves.toEqual(failed);
    const second = relay.start(payload);
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT);
    await expect(second).resolves.toEqual(failed);
    expect(page.webContents.send).toHaveBeenCalledOnce();
  });

  it.each(['render-process-gone', 'destroyed'])(
    'fails every pending start at once when the page is %s',
    async (event) => {
      const { relay, page } = listening();
      const outcome = relay.start(payload);
      await vi.advanceTimersByTimeAsync(0);
      relay.accepted({ id: 'start-1' });
      page.fire(event);
      await expect(outcome).resolves.toEqual(failed);
    },
  );

  it('opens a new hidden window when the old one was destroyed', async () => {
    const { relay, page, hidden, openHiddenWindow, close } = listening();
    page.fire('destroyed');
    close();
    const outcome = relay.start(payload);
    await vi.advanceTimersByTimeAsync(0);
    expect(openHiddenWindow).toHaveBeenCalledOnce();
    relay.rendererReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(hidden.webContents.send).toHaveBeenCalledOnce();
    relay.answer({ id: 'start-1', outcome: { ok: true } });
    await expect(outcome).resolves.toEqual({ ok: true });
  });
});

describe('the two timeouts', () => {
  it('fails when the page does not acknowledge within 15 s', async () => {
    const { relay } = listening();
    const outcome = relay.start(payload);
    await vi.advanceTimersByTimeAsync(ACCEPT_TIMEOUT);
    await expect(outcome).resolves.toEqual(failed);
  });

  it('waits until the deadline once acknowledged, then drops the late answer', async () => {
    const { relay } = listening();
    let settled = false;
    const outcome = relay.start(payload).then((value) => {
      settled = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    relay.accepted({ id: 'start-1' });
    await vi.advanceTimersByTimeAsync(ACCEPT_TIMEOUT + RESULT_TIMEOUT - 1_001);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toEqual(failed);
    expect(() => relay.answer({ id: 'start-1', outcome: { ok: true } })).not.toThrow();
  });

  it.each([null, {}, { id: '' }, { id: 'start-1', extra: 1 }])(
    'refuses the acknowledgement %j',
    (input) => {
      expect(() => listening().relay.accepted(input)).toThrow();
    },
  );

  it.each([
    null,
    { id: 'start-1' },
    { id: 'start-1', outcome: { ok: false } },
    { id: 'start-1', outcome: { ok: false, error: 'boom' } },
    { id: 'start-1', outcome: { ok: true }, extra: 1 },
  ])('refuses the answer %j', (answer) => {
    expect(() => listening().relay.answer(answer)).toThrow();
  });
});

describe('registerStartRelay', () => {
  it('takes the acknowledgement and the answer from the main page only, rate-limited', () => {
    const registrar: IpcRegistrar = { handle: vi.fn(), listen: vi.fn() };
    registerStartRelay(registrar, setup(null).relay);
    const anyAction = expect.any(Function);
    expect(registrar.listen).toHaveBeenCalledWith(
      'recording:start-accepted',
      anyAction,
      ['main'],
      5,
    );
    expect(registrar.handle).toHaveBeenCalledWith('recording:start-result', anyAction, ['main'], 5);
  });
});
