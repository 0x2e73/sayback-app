// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { restoredScroll, useTabScroll } from './use-tab-scroll';

afterEach(cleanup);

function Harness() {
  const { tab, select, scrollerRef, anchorRef } = useTabScroll<'notes' | 'transcript'>('notes');
  return (
    <div data-testid="scroller" ref={scrollerRef}>
      <div ref={anchorRef} />
      <button onClick={() => select('notes')}>Notes</button>
      <button onClick={() => select('transcript')}>Transcription</button>
      <p>{tab}</p>
    </div>
  );
}

describe('restoredScroll', () => {
  it.each([
    [undefined, 900, 240, 240],
    [undefined, 100, 240, 100],
    [500, 0, 240, 500],
    [0, 900, 240, 0],
  ])('saved %s, left at %s, anchor at %s: %s', (saved, previous, anchor, expected) => {
    expect(restoredScroll(saved, previous, anchor)).toBe(expected);
  });
});

describe('useTabScroll', () => {
  it('gives each tab back its own scroll position', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const scroller = screen.getByTestId('scroller');
    scroller.scrollTop = 300;
    await user.click(screen.getByRole('button', { name: 'Transcription' }));
    // First visit: the tab bar stays at its anchor, 0 in jsdom.
    expect(scroller.scrollTop).toBe(0);
    scroller.scrollTop = 120;
    await user.click(screen.getByRole('button', { name: 'Notes' }));
    expect(scroller.scrollTop).toBe(300);
    await user.click(screen.getByRole('button', { name: 'Transcription' }));
    expect(scroller.scrollTop).toBe(120);
  });

  it('leaves the scroll alone when the current tab is chosen again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const scroller = screen.getByTestId('scroller');
    scroller.scrollTop = 300;
    await user.click(screen.getByRole('button', { name: 'Notes' }));
    expect(scroller.scrollTop).toBe(300);
    expect(screen.getByText('notes')).toBeInTheDocument();
  });
});
