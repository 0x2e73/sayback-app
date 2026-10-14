import { describe, expect, it, vi } from 'vitest';
import { guardClose } from './close-guard';

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
