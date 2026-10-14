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

  it('counts from the announced elapsed time every second, then clears the title', () => {
    const { menuBar, titles, menus } = fixture();
    menuBar.announce({ recording: true, elapsed: 5, paused: false });
    expect(menus.at(-1)?.[0]?.label).toBe('Arrêter l’enregistrement');
    vi.advanceTimersByTime(2000);
    expect(titles).toEqual(['00:05', '00:06', '00:07']);
    menuBar.announce({ recording: false });
    vi.advanceTimersByTime(5000);
    expect(titles.at(-1)).toBe('');
    expect(titles).toHaveLength(4);
    expect(menus.at(-1)?.[0]?.label).toBe('Nouvel enregistrement…');
  });

  it('freezes the title while paused, then resumes from the announced time', () => {
    const { menuBar, titles } = fixture();
    menuBar.announce({ recording: true, elapsed: 30, paused: false });
    vi.advanceTimersByTime(2000);
    menuBar.announce({ recording: true, elapsed: 32, paused: true });
    vi.advanceTimersByTime(60_000);
    expect(titles).toEqual(['00:30', '00:31', '00:32', '00:32']);
    menuBar.announce({ recording: true, elapsed: 32, paused: false });
    vi.advanceTimersByTime(1000);
    expect(titles.slice(-2)).toEqual(['00:32', '00:33']);
  });

  it('keeps the stop entry while paused', () => {
    const { menuBar, menus } = fixture();
    menuBar.announce({ recording: true, elapsed: 3, paused: true });
    expect(menus.at(-1)?.[0]?.label).toBe('Arrêter l’enregistrement');
  });

  it('runs a single timer when the state is announced twice', () => {
    const { menuBar, titles } = fixture();
    menuBar.announce({ recording: true, elapsed: 0, paused: false });
    menuBar.announce({ recording: true, elapsed: 0, paused: false });
    titles.length = 0;
    vi.advanceTimersByTime(1000);
    expect(titles).toEqual(['00:01']);
  });

  it('stops the timer and removes the icon when destroyed', () => {
    const { menuBar, tray, titles } = fixture();
    menuBar.announce({ recording: true, elapsed: 0, paused: false });
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
    const call = (input: unknown) => handlers.get('recording:state')?.(input);
    return { announce, ready, call };
  }

  it('passes a valid announcement on and tells the page is ready', () => {
    const { announce, ready, call } = registered();
    call({ recording: true, elapsed: 12.5, paused: true });
    call({ recording: false });
    expect(announce.mock.calls).toEqual([
      [{ recording: true, elapsed: 12.5, paused: true }],
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
    { recording: true, elapsed: 3 },
    { recording: true, paused: false },
    { recording: true, elapsed: -1, paused: false },
    { recording: true, elapsed: '3', paused: false },
    { recording: true, elapsed: Infinity, paused: false },
    { recording: true, elapsed: 1e9, paused: false },
    { recording: true, elapsed: 3, paused: 'no' },
  ])('refuses %j without touching the menu bar', (input) => {
    const { announce, ready, call } = registered();
    expect(() => call(input)).toThrow();
    expect(announce).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
  });
});
