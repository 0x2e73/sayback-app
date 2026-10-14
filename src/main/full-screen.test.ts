import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { RegisterHandler } from './ipc';
import { registerWindowHandlers, relayFullScreen } from './full-screen';

class FakeWindow extends EventEmitter {
  fullScreen = false;
  readonly webContents = { send: vi.fn<(channel: string, fullScreen: boolean) => void>() };
  isFullScreen(): boolean {
    return this.fullScreen;
  }
}

function registered(getWindow: () => FakeWindow | null) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle: RegisterHandler = (channel, action) => {
    handlers.set(channel, action);
  };
  registerWindowHandlers(handle, getWindow);
  return handlers;
}

describe('relayFullScreen', () => {
  it('tells the page when the window enters and leaves full screen', () => {
    const window = new FakeWindow();
    relayFullScreen(window);
    window.emit('enter-full-screen');
    window.emit('leave-full-screen');
    expect(window.webContents.send.mock.calls).toEqual([
      ['window:full-screen-changed', true],
      ['window:full-screen-changed', false],
    ]);
  });
});

describe('registerWindowHandlers', () => {
  it('answers the current state, for a page that reloads in full screen', () => {
    const window = new FakeWindow();
    window.fullScreen = true;
    expect(registered(() => window).get('window:is-full-screen')?.()).toBe(true);
  });

  it('answers no when there is no window', () => {
    expect(registered(() => null).get('window:is-full-screen')?.()).toBe(false);
  });
});
