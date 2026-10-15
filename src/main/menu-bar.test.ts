import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingState } from '../shared/recording-state';
import { createMenuBar, type TrayPort } from './menu-bar';
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
    now: () => Date.now(),
  });
  // The hub stamps each state when it receives it.
  const announce = (state: RecordingState) => menuBar.announce({ state, receivedAt: Date.now() });
  return { titles, menus, tray, menuBar, announce };
}

const running = (elapsed: number, extra: Partial<RecordingState> = {}): RecordingState =>
  ({ recording: true, elapsed, paused: false, stopping: false, ...extra }) as RecordingState;

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
    const { announce, titles, menus } = fixture();
    announce(running(5));
    expect(menus.at(-1)?.[0]?.label).toBe('Arrêter l’enregistrement');
    vi.advanceTimersByTime(2000);
    expect(titles).toEqual(['00:05', '00:06', '00:07']);
    announce({ recording: false });
    vi.advanceTimersByTime(5000);
    expect(titles.at(-1)).toBe('');
    expect(titles).toHaveLength(4);
    expect(menus.at(-1)?.[0]?.label).toBe('Nouvel enregistrement…');
  });

  it('counts from the reception time of the hub, not from the announcement call', () => {
    const { menuBar, titles } = fixture();
    const receivedAt = Date.now();
    vi.advanceTimersByTime(3000);
    menuBar.announce({ state: running(5), receivedAt });
    expect(titles).toEqual(['00:08']);
  });

  it('freezes the title while paused, then resumes from the announced time', () => {
    const { announce, titles } = fixture();
    announce(running(30));
    vi.advanceTimersByTime(2000);
    announce(running(32, { paused: true }));
    vi.advanceTimersByTime(60_000);
    expect(titles).toEqual(['00:30', '00:31', '00:32', '00:32']);
    announce(running(32));
    vi.advanceTimersByTime(1000);
    expect(titles.slice(-2)).toEqual(['00:32', '00:33']);
  });

  it('freezes the title and disables the stop entry while the recording closes', () => {
    const { announce, titles, menus } = fixture();
    announce(running(40, { stopping: true }));
    vi.advanceTimersByTime(5000);
    expect(titles).toEqual(['00:40']);
    expect(menus.at(-1)?.[0]).toEqual({ label: 'Arrêt en cours…', enabled: false });
  });

  it('keeps the stop entry while paused', () => {
    const { announce, menus } = fixture();
    announce(running(3, { paused: true }));
    expect(menus.at(-1)?.[0]?.label).toBe('Arrêter l’enregistrement');
  });

  it('runs a single timer when the state is announced twice', () => {
    const { announce, titles } = fixture();
    announce(running(0));
    announce(running(0));
    titles.length = 0;
    vi.advanceTimersByTime(1000);
    expect(titles).toEqual(['00:01']);
  });

  it('stops the timer and removes the icon when destroyed', () => {
    const { announce, menuBar, tray, titles } = fixture();
    announce(running(0));
    menuBar.destroy();
    titles.length = 0;
    vi.advanceTimersByTime(3000);
    expect(titles).toEqual([]);
    expect(tray.destroy).toHaveBeenCalledOnce();
  });
});
