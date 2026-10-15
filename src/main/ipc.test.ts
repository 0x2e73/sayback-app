import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Result } from '../shared/contracts';

type Event = { sender: unknown; senderFrame: unknown };
type Invoke = (event: Event, ...args: unknown[]) => Promise<Result<unknown>>;
type Send = (event: Event, ...args: unknown[]) => void;

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  listeners: new Map<string, (event: unknown, ...args: unknown[]) => void>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      electron.handlers.set(channel, handler);
    },
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
      electron.listeners.set(channel, listener);
    },
  },
}));

import { createIpcRegistrar } from './ipc';
import { createWindowRoles } from './window-roles';

function fakeWindow() {
  const mainFrame = { name: 'top' };
  return { webContents: { mainFrame }, subFrame: { name: 'iframe' } };
}

const main = fakeWindow();
const island = fakeWindow();
let islandOpen = true;
const stranger = fakeWindow();

const from = (window: ReturnType<typeof fakeWindow>): Event => ({
  sender: window.webContents,
  senderFrame: window.webContents.mainFrame,
});
const fromSubFrame = (window: ReturnType<typeof fakeWindow>): Event => ({
  sender: window.webContents,
  senderFrame: window.subFrame,
});

const invoke = (channel: string, event: Event, ...args: unknown[]) =>
  (electron.handlers.get(channel) as Invoke)(event, ...args);
const send = (channel: string, event: Event, ...args: unknown[]) =>
  (electron.listeners.get(channel) as Send)(event, ...args);

const received: string[] = [];

beforeEach(() => {
  electron.handlers.clear();
  electron.listeners.clear();
  received.length = 0;
  islandOpen = true;
  const roles = createWindowRoles({ main: () => main, island: () => (islandOpen ? island : null) });
  const { handle, listen } = createIpcRegistrar(roles);
  handle('meetings:list', () => 'meetings');
  handle('island:ready', () => 'snapshot', ['island']);
  listen('live:level', (level) => {
    received.push(`level ${String(level)}`);
  });
  listen(
    'island:poke',
    () => {
      received.push('poke');
    },
    ['island'],
  );
});

describe('role matrix for invoke channels', () => {
  it.each([
    ['meetings:list', 'main', true],
    ['meetings:list', 'island', false],
    ['meetings:list', 'stranger', false],
    ['island:ready', 'main', false],
    ['island:ready', 'island', true],
    ['island:ready', 'stranger', false],
  ] as const)('%s from the %s window: allowed %s', async (channel, who, allowed) => {
    const window = { main, island, stranger }[who];
    const answer = await invoke(channel, from(window));
    expect(answer.ok).toBe(allowed);
    if (!answer.ok) expect(answer.error).toBe('Accès refusé.');
  });

  it('refuses a sub-frame of an allowed window', async () => {
    expect((await invoke('meetings:list', fromSubFrame(main))).ok).toBe(false);
    expect((await invoke('island:ready', fromSubFrame(island))).ok).toBe(false);
  });

  it('refuses the island channels once the island is gone', async () => {
    islandOpen = false;
    expect((await invoke('island:ready', from(island))).ok).toBe(false);
  });
});

describe('role matrix for send channels', () => {
  it('passes a message from an allowed window only', () => {
    send('live:level', from(main), 0.5);
    send('live:level', from(island), 0.6);
    send('live:level', fromSubFrame(main), 0.7);
    send('island:poke', from(main));
    send('island:poke', from(island));
    send('island:poke', from(stranger));
    expect(received).toEqual(['level 0.5', 'poke']);
  });

  it('drops a message whose handler throws, without raising', () => {
    const { listen } = createIpcRegistrar(
      createWindowRoles({ main: () => main, island: () => null }),
    );
    listen('live:broken', () => {
      throw new Error('invalid');
    });
    expect(() => send('live:broken', from(main), 'nonsense')).not.toThrow();
  });
});

describe('invoke results', () => {
  it('wraps the value and the failures', async () => {
    const { handle } = createIpcRegistrar(
      createWindowRoles({ main: () => main, island: () => null }),
    );
    handle('x:fails', () => {
      throw new Error('Précis.');
    });
    expect(await invoke('meetings:list', from(main))).toEqual({ ok: true, value: 'meetings' });
    expect(await invoke('x:fails', from(main))).toEqual({ ok: false, error: 'Précis.' });
  });
});
