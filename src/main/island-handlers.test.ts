import { describe, expect, it, vi } from 'vitest';
import type { IslandWindowPort } from './island-controller';
import { registerIslandHandlers } from './island-handlers';
import type { IpcRegistrar } from './ipc';
import type { WindowRole } from './window-roles';

const shownWindow: IslandWindowPort = {
  webContents: { mainFrame: {}, send: vi.fn(), isDestroyed: () => false, on: vi.fn() },
  showInactive: vi.fn(),
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

  it.each(['pause', 'resume', 'stop', 'open'])('passes the %s request on', (request) => {
    const { actions, island } = registered();
    actions.get('island:request')?.(request);
    expect(island.request).toHaveBeenCalledWith(request);
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
