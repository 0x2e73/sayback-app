import { describe, expect, it, vi } from 'vitest';
import { guardClose, revealForSheet } from './close-guard';

function sheetWindow(state: { visible: boolean; minimized: boolean }) {
  return {
    isVisible: () => state.visible,
    isMinimized: () => state.minimized,
    show: vi.fn(),
    restore: vi.fn(),
  };
}

describe('revealForSheet', () => {
  it('shows a hidden window, which carries a capture started from the island', () => {
    const window = sheetWindow({ visible: false, minimized: false });
    revealForSheet(window);
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.restore).not.toHaveBeenCalled();
  });

  it('restores a minimised window', () => {
    const window = sheetWindow({ visible: true, minimized: true });
    revealForSheet(window);
    expect(window.restore).toHaveBeenCalledOnce();
  });

  it('leaves a visible window as it is', () => {
    const window = sheetWindow({ visible: true, minimized: false });
    revealForSheet(window);
    expect(window.show).not.toHaveBeenCalled();
    expect(window.restore).not.toHaveBeenCalled();
  });
});

describe('guardClose', () => {
  it('refuses to close during a recording and says why', () => {
    const event = { preventDefault: vi.fn() };
    const warn = vi.fn();
    guardClose(() => true, event, warn);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('lets the window close, and so the app quit, at rest', () => {
    const event = { preventDefault: vi.fn() };
    const warn = vi.fn();
    guardClose(() => false, event, warn);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
