import { describe, expect, it, vi } from 'vitest';
import type { Result } from '../shared/contracts';
import type { IslandWindowPort } from './island-ports';
import { registerIslandHandlers } from './island-handlers';
import { createIpcRegistrar, type IpcRegistrar } from './ipc';
import { createWindowRoles, type WindowRole } from './window-roles';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => Promise<Result<unknown>>>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => never) => {
      electron.handlers.set(channel, handler);
    },
    on: vi.fn(),
  },
}));

const start = {
  type: 'start',
  title: 'Réunion du 15 octobre, 11 h 00',
  selection: { microphone: true, systemAudio: true, screen: true, screenId: 'screen:1:0' },
};

const shownWindow: IslandWindowPort = {
  webContents: { mainFrame: {}, send: vi.fn(), isDestroyed: () => false, on: vi.fn() },
  showInactive: vi.fn(),
  getMediaSourceId: () => 'window:99:0',
  setBounds: vi.fn(),
  setIgnoreMouseEvents: vi.fn(),
  isDestroyed: () => false,
  destroy: vi.fn(),
};

describe('registerIslandHandlers', () => {
  function registered(shown = true) {
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
      toggle: vi.fn(),
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

  it.each(['pause', 'resume', 'stop', 'open', 'close', 'open-privacy-settings', 'cycle-screen'])(
    'passes the %s request on',
    (request) => {
      const { actions, island } = registered();
      actions.get('island:request')?.(request);
      expect(island.request).toHaveBeenCalledWith(request);
    },
  );

  it('passes a valid start on, its title trimmed', () => {
    const { actions, island } = registered();
    actions.get('island:request')?.({ ...start, title: '  Point hebdo  ' });
    expect(island.request).toHaveBeenCalledWith({ ...start, title: 'Point hebdo' });
  });

  it.each([
    ['an empty title', { ...start, title: '   ' }],
    ['a title over 160 characters', { ...start, title: 'a'.repeat(161) }],
    [
      'a window instead of a screen',
      { ...start, selection: { ...start.selection, screenId: 'window:4:0' } },
    ],
    [
      'a screen capture without a screen',
      { ...start, selection: { ...start.selection, screenId: undefined } },
    ],
    [
      'the system audio without the screen',
      { ...start, selection: { ...start.selection, screen: false } },
    ],
    ['a missing source', { ...start, selection: { microphone: true, screen: false } }],
    ['an unknown field', { ...start, meetingId: 'x' }],
  ])('refuses a start with %s', (_case, request) => {
    const { actions, island } = registered();
    expect(() => actions.get('island:request')?.(request)).toThrow();
    expect(island.request).not.toHaveBeenCalled();
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

describe('island requests through the role registrar', () => {
  const windowOf = () => ({ webContents: { mainFrame: {} }, isDestroyed: () => false });
  const main = windowOf();
  const islandWindow = windowOf();
  const from = (window: ReturnType<typeof windowOf>) => ({
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  });

  function wired() {
    electron.handlers.clear();
    const island = {
      window: () => null,
      ready: vi.fn(),
      request: vi.fn(),
      toggle: vi.fn(),
      level: vi.fn(),
      screensChanged: vi.fn(),
      close: vi.fn(),
    };
    const roles = createWindowRoles({ main: () => main, island: () => islandWindow });
    registerIslandHandlers(createIpcRegistrar(roles), island);
    const invoke = (window: ReturnType<typeof windowOf>, input: unknown) =>
      electron.handlers.get('island:request')?.(from(window), input);
    return { island, invoke };
  }

  it('refuses a start sent by the main window', async () => {
    const { island, invoke } = wired();
    await expect(invoke(main, start)).resolves.toEqual({ ok: false, error: 'Accès refusé.' });
    expect(island.request).not.toHaveBeenCalled();
  });

  it('takes it from the island, and answers a bad payload with a generic error', async () => {
    const { island, invoke } = wired();
    await expect(invoke(islandWindow, start)).resolves.toEqual({ ok: true, value: undefined });
    await expect(invoke(islandWindow, { ...start, title: '' })).resolves.toEqual({
      ok: false,
      error: 'Vérifiez les informations saisies.',
    });
    expect(island.request).toHaveBeenCalledOnce();
  });
});
