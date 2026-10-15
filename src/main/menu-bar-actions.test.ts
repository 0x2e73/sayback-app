import { describe, expect, it, vi } from 'vitest';
import { createMenuBarActions, type MenuBarWindow } from './menu-bar-actions';

function fakeWindow(options: { minimized?: boolean; loading?: boolean } = {}) {
  return {
    isMinimized: () => options.minimized ?? false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    webContents: { isLoading: () => options.loading ?? false, send: vi.fn() },
  } satisfies MenuBarWindow;
}

function setup(initial: MenuBarWindow | null, recording = false) {
  let current = initial;
  const reopened = fakeWindow({ loading: true });
  const quitApp = vi.fn();
  const openWindow = vi.fn(() => {
    current = reopened;
    return reopened;
  });
  const actions = createMenuBarActions({
    getWindow: () => current,
    openWindow,
    isRecording: () => recording,
    quitApp,
  });
  return { actions, reopened, openWindow, quitApp };
}

describe('new recording', () => {
  it('shows the open window and asks its page for the dialog', () => {
    const window = fakeWindow({ minimized: true });
    setup(window).actions.newRecording();
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.webContents.send).toHaveBeenCalledWith('menu-bar:new-recording');
  });

  it('reopens a closed window and waits for its page before asking', () => {
    const { actions, reopened, openWindow } = setup(null);
    actions.newRecording();
    expect(openWindow).toHaveBeenCalledOnce();
    expect(reopened.show).toHaveBeenCalled();
    expect(reopened.webContents.send).not.toHaveBeenCalled();
    actions.rendererReady();
    actions.rendererReady();
    expect(reopened.webContents.send.mock.calls).toEqual([['menu-bar:new-recording']]);
  });

  it('waits too when the page of an existing window is still loading', () => {
    const window = fakeWindow({ loading: true });
    const { actions } = setup(window);
    actions.newRecording();
    expect(window.webContents.send).not.toHaveBeenCalled();
    actions.rendererReady();
    expect(window.webContents.send).toHaveBeenCalledWith('menu-bar:new-recording');
  });

  it('does nothing when no window can be opened', () => {
    const actions = createMenuBarActions({
      getWindow: () => null,
      openWindow: () => null,
      isRecording: () => false,
      quitApp: vi.fn(),
    });
    expect(() => actions.newRecording()).not.toThrow();
    expect(() => actions.rendererReady()).not.toThrow();
  });
});

describe('stop recording and open', () => {
  it('asks the page to stop', () => {
    const window = fakeWindow();
    setup(window).actions.stopRecording();
    expect(window.webContents.send).toHaveBeenCalledWith('recording:request', 'stop');
  });

  it.each(['pause', 'resume', 'stop'] as const)('passes the %s request to the page', (request) => {
    const window = fakeWindow();
    setup(window).actions.request(request);
    expect(window.webContents.send.mock.calls).toEqual([['recording:request', request]]);
  });

  it('ignores a request without a window, without opening one', () => {
    const { actions, openWindow } = setup(null);
    expect(() => actions.request('pause')).not.toThrow();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('ignores a stop request without a window', () => {
    const { actions, openWindow } = setup(null);
    expect(() => actions.stopRecording()).not.toThrow();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('opens SayBack without asking for anything', () => {
    const window = fakeWindow();
    setup(window).actions.open();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.webContents.send).not.toHaveBeenCalled();
  });
});

describe('quit', () => {
  it('quits the app at rest, without bringing the window forward', () => {
    const window = fakeWindow();
    const { actions, quitApp } = setup(window);
    actions.quit();
    expect(quitApp).toHaveBeenCalledOnce();
    expect(window.show).not.toHaveBeenCalled();
  });

  it('shows the window first during a recording, so the refusal to close is seen', () => {
    const window = fakeWindow();
    const { actions, quitApp } = setup(window, true);
    actions.quit();
    expect(window.show).toHaveBeenCalledOnce();
    expect(quitApp).toHaveBeenCalledOnce();
  });
});
