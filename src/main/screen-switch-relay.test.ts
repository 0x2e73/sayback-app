import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreenSwitchRelay, SWITCH_REQUEST, SWITCH_TIMEOUT } from './screen-switch-relay';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function page() {
  return {
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
    executeJavaScript: vi.fn(async () => undefined),
  };
}

function relayTo(contents: ReturnType<typeof page> | null) {
  let n = 0;
  return createScreenSwitchRelay({
    getWindow: () => (contents ? { webContents: contents } : null),
    newId: () => `switch-${++n}`,
  });
}

describe('the screen switch relay', () => {
  it('primes an activation, then asks the page and settles with its answer', async () => {
    const contents = page();
    const relay = relayTo(contents);
    const switched = relay.switchScreen('screen:2:0');
    await vi.advanceTimersByTimeAsync(0);
    expect(contents.executeJavaScript).toHaveBeenCalledWith('void 0', true);
    expect(contents.send).toHaveBeenCalledWith(SWITCH_REQUEST, {
      id: 'switch-1',
      screenId: 'screen:2:0',
    });
    relay.answer({ id: 'switch-1', ok: true });
    await expect(switched).resolves.toBe(true);
  });

  it('reports a refusal of the page', async () => {
    const relay = relayTo(page());
    const switched = relay.switchScreen('screen:2:0');
    await vi.advanceTimersByTimeAsync(0);
    relay.answer({ id: 'switch-1', ok: false });
    await expect(switched).resolves.toBe(false);
  });

  it('fails without a page, when the activation fails, or without an answer in time', async () => {
    await expect(relayTo(null).switchScreen('screen:2:0')).resolves.toBe(false);
    const broken = page();
    broken.executeJavaScript.mockRejectedValueOnce(new Error('gone'));
    await expect(relayTo(broken).switchScreen('screen:2:0')).resolves.toBe(false);
    expect(broken.send).not.toHaveBeenCalled();
    const silent = relayTo(page()).switchScreen('screen:2:0');
    await vi.advanceTimersByTimeAsync(SWITCH_TIMEOUT);
    await expect(silent).resolves.toBe(false);
  });

  it('drops a late or unknown answer, and refuses a malformed one', async () => {
    const relay = relayTo(page());
    expect(() => relay.answer({ id: 'switch-9', ok: true })).not.toThrow();
    expect(() => relay.answer({ id: 'switch-1', ok: 'yes' })).toThrow();
    expect(() => relay.answer({ id: 'switch-1', ok: true, screenId: 'x' })).toThrow();
  });
});
