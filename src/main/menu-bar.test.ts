import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisterHandler } from './ipc';
import { createMenuBar, registerMenuBarHandlers, type TrayPort } from './menu-bar';
import type { MenuBarActions, MenuBarEntry } from './menu-bar-menu';

const actions: MenuBarActions = {
  newRecording: vi.fn(),
  stopRecording: vi.fn(),
  open: vi.fn(),
  quit: vi.fn(),
};

function fixture() {
  const titles: string[] = [];
  const menus: MenuBarEntry[][] = [];
  const tray: TrayPort = {
    setTitle: (title) => titles.push(title),
    setContextMenu: vi.fn(),
    destroy: vi.fn(),
  };
  const menuBar = createMenuBar({
    createTray: () => tray,
    buildMenu: (template) => {
      menus.push(template);
      return template;
    },
    actions,
  });
  return { titles, menus, tray, menuBar };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T10:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('createMenuBar', () => {
  it('starts with the menu at rest and no title', () => {
    const { menus, titles } = fixture();
    expect(menus).toHaveLength(1);
    expect(menus[0]?.[0]?.label).toBe('Nouvel enregistrement…');
    expect(titles).toEqual([]);
  });

  it('shows the timer every second during a recording, then clears it', () => {
    const { menuBar, titles, menus } = fixture();
    menuBar.announce({ recording: true, startedAt: '2026-10-14T09:59:55.000Z' });
    expect(menus.at(-1)?.[0]?.label).toBe('Arrêter l’enregistrement');
    vi.advanceTimersByTime(2000);
    expect(titles).toEqual(['00:05', '00:06', '00:07']);
    menuBar.announce({ recording: false });
    vi.advanceTimersByTime(5000);
    expect(titles.at(-1)).toBe('');
    expect(titles).toHaveLength(4);
    expect(menus.at(-1)?.[0]?.label).toBe('Nouvel enregistrement…');
  });

  it('runs a single timer when the recording is announced twice', () => {
    const { menuBar, titles } = fixture();
    menuBar.announce({ recording: true, startedAt: '2026-10-14T10:00:00.000Z' });
    menuBar.announce({ recording: true, startedAt: '2026-10-14T10:00:00.000Z' });
    titles.length = 0;
    vi.advanceTimersByTime(1000);
    expect(titles).toEqual(['00:01']);
  });

  it('never shows a negative time for a start in the future', () => {
    const { menuBar, titles } = fixture();
    menuBar.announce({ recording: true, startedAt: '2026-10-14T10:05:00.000Z' });
    expect(titles).toEqual(['00:00']);
  });

  it('stops the timer and removes the icon when destroyed', () => {
    const { menuBar, tray, titles } = fixture();
    menuBar.announce({ recording: true, startedAt: '2026-10-14T10:00:00.000Z' });
    menuBar.destroy();
    titles.length = 0;
    vi.advanceTimersByTime(3000);
    expect(titles).toEqual([]);
    expect(tray.destroy).toHaveBeenCalledOnce();
  });
});

describe('registerMenuBarHandlers', () => {
  function registered() {
    const announce = vi.fn();
    const ready = vi.fn();
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const handle: RegisterHandler = (channel, action) => {
      handlers.set(channel, action);
    };
    registerMenuBarHandlers(handle, { announce }, ready);
    const call = (input: unknown) => handlers.get('menu-bar:recording')?.(input);
    return { announce, ready, call };
  }

  it('passes a valid announcement on and tells the page is ready', () => {
    const { announce, ready, call } = registered();
    call({ recording: true, startedAt: '2026-10-14T10:00:00.000Z' });
    call({ recording: false });
    expect(announce.mock.calls).toEqual([
      [{ recording: true, startedAt: '2026-10-14T10:00:00.000Z' }],
      [{ recording: false }],
    ]);
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it.each([
    undefined,
    null,
    {},
    'recording',
    { recording: 'yes' },
    { recording: true },
    { recording: true, startedAt: 'yesterday' },
    { recording: true, startedAt: 42 },
  ])('refuses %j without touching the menu bar', (input) => {
    const { announce, ready, call } = registered();
    expect(() => call(input)).toThrow();
    expect(announce).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
  });
});
