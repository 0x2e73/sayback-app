import { describe, expect, it, vi } from 'vitest';
import { menuBarTemplate, type MenuBarActions } from './menu-bar-menu';

function actions(): MenuBarActions {
  return { newRecording: vi.fn(), stopRecording: vi.fn(), open: vi.fn(), quit: vi.fn() };
}

const running = { recording: true, elapsed: 4, paused: false, stopping: false } as const;

describe('menuBarTemplate', () => {
  it('offers a new recording at rest', () => {
    const labels = menuBarTemplate({ recording: false }, actions()).map(
      (entry) => entry.label ?? entry.type,
    );
    expect(labels).toEqual(['Nouvelle réunion…', 'Ouvrir SayBack', 'separator', 'Quitter SayBack']);
  });

  it('offers to stop during a recording', () => {
    const labels = menuBarTemplate(running, actions()).map((entry) => entry.label ?? entry.type);
    expect(labels).toEqual([
      'Arrêter l’enregistrement',
      'Ouvrir SayBack',
      'separator',
      'Quitter SayBack',
    ]);
  });

  it('shows a disabled closing entry while the recording closes', () => {
    const [first] = menuBarTemplate({ ...running, stopping: true }, actions());
    expect(first).toEqual({ label: 'Arrêt en cours…', enabled: false });
  });

  it('wires each entry to its action', () => {
    const wired = actions();
    const [first, open, , quit] = menuBarTemplate(running, wired);
    first?.click?.();
    open?.click?.();
    quit?.click?.();
    expect(wired.stopRecording).toHaveBeenCalledOnce();
    expect(wired.open).toHaveBeenCalledOnce();
    expect(wired.quit).toHaveBeenCalledOnce();
    expect(wired.newRecording).not.toHaveBeenCalled();
  });
});
