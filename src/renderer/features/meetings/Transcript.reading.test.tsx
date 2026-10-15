// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createPlaybackClock } from './playback-clock';
import {
  handlers,
  meetingWith,
  recordScrolls,
  TranscriptHarness,
  turnOf,
} from './transcript-harness';

let scrolled: ReturnType<typeof recordScrolls>;

beforeEach(() => {
  scrolled = recordScrolls();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.getSelection()?.removeAllRanges();
});

const meeting = meetingWith([
  { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
  { id: '0-1', start: 4, end: 6, text: 'Salut.', speaker: 'B' },
]);

// Puts one turn far below the viewport.
function placeTurn(id: string, top: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect(
    this: Element,
  ) {
    const span =
      this.getAttribute('data-turn') === id ? { top, bottom: top + 60 } : { top: 0, bottom: 600 };
    return DOMRect.fromRect({ x: 0, y: span.top, width: 600, height: span.bottom - span.top });
  });
}

function scroller() {
  const element = document.createElement('div');
  document.body.append(element);
  return { current: element };
}

const pill = () => screen.queryByRole('button', { name: 'Revenir au direct' });

it('highlights nothing in a silence but keeps the last turn started as the one read', () => {
  placeTurn('0-0', 900);
  const clock = createPlaybackClock(3.5);
  render(
    <TranscriptHarness meeting={meeting} clock={clock} following={false} scroller={scroller()} />,
  );
  expect(screen.getAllByRole('article').some((turn) => turn.hasAttribute('aria-current'))).toBe(
    false,
  );
  expect(pill()).toBeInTheDocument();
  act(() => clock.set(3.9));
  expect(pill()).toBeInTheDocument();
});

it('leaves the view where it is when the playback enters a silence', () => {
  const clock = createPlaybackClock(4.5);
  render(<TranscriptHarness meeting={meeting} clock={clock} />);
  scrolled.mockClear();
  act(() => clock.set(6.5));
  expect(scrolled).not.toHaveBeenCalled();
  expect(turnOf('Salut.')).not.toHaveAttribute('aria-current');
});

it('counts a selection inside the transcript as a release for the pill', () => {
  placeTurn('0-1', 900);
  render(
    <TranscriptHarness meeting={meeting} clock={createPlaybackClock(4.5)} scroller={scroller()} />,
  );
  expect(pill()).toBeNull();
  document.getSelection()?.selectAllChildren(screen.getByText('Bonjour.'));
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
  expect(pill()).toBeInTheDocument();
});

it('looks again next frame after a long jump to the turn playing', async () => {
  placeTurn('0-1', 900);
  render(
    <TranscriptHarness
      meeting={meeting}
      clock={createPlaybackClock(4.5)}
      following={false}
      scroller={scroller()}
    />,
  );
  scrolled.mockClear();
  pill()?.click();
  expect(handlers.onFollow).toHaveBeenCalledOnce();
  expect(scrolled).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(2));
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('Salut.'), { block: 'center' });
});
