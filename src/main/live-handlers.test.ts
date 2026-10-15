import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LivePcm } from '../shared/live';

type Event = { sender: unknown; senderFrame: unknown };
type Send = (event: Event, ...args: unknown[]) => void;

const electron = vi.hoisted(() => ({
  listeners: new Map<string, (event: unknown, ...args: unknown[]) => void>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
      electron.listeners.set(channel, listener);
    },
  },
}));

import { createIpcRegistrar } from './ipc';
import { registerLiveHandlers } from './live-handlers';
import { createWindowRoles } from './window-roles';

function fakeWindow() {
  const mainFrame = { name: 'top' };
  return { webContents: { mainFrame }, subFrame: { name: 'iframe' }, isDestroyed: () => false };
}

const main = fakeWindow();
const island = fakeWindow();
const from = (window: ReturnType<typeof fakeWindow>): Event => ({
  sender: window.webContents,
  senderFrame: window.webContents.mainFrame,
});
let time = 0;
let received: LivePcm[] = [];

const send = (event: Event, ...args: unknown[]) =>
  (electron.listeners.get('live:pcm') as Send)(event, ...args);

beforeEach(() => {
  electron.listeners.clear();
  received = [];
  time = 0;
  const roles = createWindowRoles({ main: () => main, island: () => island });
  registerLiveHandlers(
    createIpcRegistrar(roles, () => time),
    {
      pcm: (input) => received.push(input),
    },
  );
});

const block = (length = 3_200) => new Int16Array(length);

describe('live:pcm', () => {
  it('passes a block of the main page on', () => {
    send(from(main), { track: 'microphone', offset: 0, samples: block() });
    send(from(main), { track: 'system', offset: 0, samples: block(1) });

    expect(received.map(({ track, samples }) => [track, samples.length])).toEqual([
      ['microphone', 3_200],
      ['system', 1],
    ]);
  });

  it('drops audio from the island or from a frame inside the main page', () => {
    send(from(island), { track: 'microphone', offset: 0, samples: block() });
    send(
      { sender: main.webContents, senderFrame: main.subFrame },
      {
        track: 'microphone',
        offset: 0,
        samples: block(),
      },
    );

    expect(received).toEqual([]);
  });

  it.each([
    ['an empty block', { track: 'microphone', offset: 0, samples: block(0) }],
    ['more than a second', { track: 'microphone', offset: 0, samples: block(16_001) }],
    ['an unknown track', { track: 'speaker', offset: 0, samples: block() }],
    ['float samples', { track: 'microphone', offset: 0, samples: new Float32Array(3_200) }],
    ['a plain array', { track: 'microphone', offset: 0, samples: [1, 2, 3] }],
    ['a negative offset', { track: 'microphone', offset: -1, samples: block() }],
    ['a fractional offset', { track: 'microphone', offset: 0.5, samples: block() }],
    ['no offset', { track: 'microphone', samples: block() }],
    ['nothing', undefined],
  ])('drops %s without an answer', (_name, payload) => {
    expect(() => send(from(main), payload)).not.toThrow();
    expect(received).toEqual([]);
  });

  it('drops a message carrying more than one payload', () => {
    send(from(main), { track: 'microphone', offset: 0, samples: block() }, 'extra');

    expect(received).toEqual([]);
  });

  it('drops messages beyond a hundred a second, before any validation', () => {
    for (let index = 0; index < 120; index += 1) {
      send(from(main), { track: 'microphone', offset: 0, samples: block() });
    }
    time = 1_000;
    send(from(main), { track: 'microphone', offset: 0, samples: block() });

    expect(received).toHaveLength(101);
  });
});
