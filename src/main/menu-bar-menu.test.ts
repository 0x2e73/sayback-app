import { describe, expect, it, vi } from 'vitest';
import { chronoLabel, menuBarTemplate, type MenuBarActions } from './menu-bar-menu';

function actions(): MenuBarActions {
  return { newRecording: vi.fn(), stopRecording: vi.fn(), open: vi.fn(), quit: vi.fn() };
}

describe('menuBarTemplate', () => {
  it('offers a new recording at rest', () => {
    const labels = menuBarTemplate(false, actions()).map((entry) => entry.label ?? entry.type);
    expect(labels).toEqual([
      'Nouvel enregistrement…',
      'Ouvrir SayBack',
      'separator',
      'Quitter SayBack',
    ]);
  });

  it('offers to stop during a recording', () => {
    const labels = menuBarTemplate(true, actions()).map((entry) => entry.label ?? entry.type);
    expect(labels).toEqual([
      'Arrêter l’enregistrement',
      'Ouvrir SayBack',
      'separator',
      'Quitter SayBack',
    ]);
  });

  it('wires each entry to its action', () => {
    const wired = actions();
    const [first, open, , quit] = menuBarTemplate(true, wired);
    first?.click?.();
    open?.click?.();
    quit?.click?.();
    expect(wired.stopRecording).toHaveBeenCalledOnce();
    expect(wired.open).toHaveBeenCalledOnce();
    expect(wired.quit).toHaveBeenCalledOnce();
    expect(wired.newRecording).not.toHaveBeenCalled();
  });
});

describe('chronoLabel', () => {
  it.each([
    [0, '00:00'],
    [9.9, '00:09'],
    [65, '01:05'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [-4, '00:00'],
    [36000, '10:00:00'],
  ])('writes %s seconds as %s', (seconds, label) => {
    expect(chronoLabel(seconds)).toBe(label);
  });
});
