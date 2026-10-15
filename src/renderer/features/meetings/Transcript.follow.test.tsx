// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  { id: '0-2', start: 7, end: 9, text: 'On commence.', speaker: 'A' },
]);

it('follows the playback onto the next turn, instantly', () => {
  const clock = createPlaybackClock(1);
  render(<TranscriptHarness meeting={meeting} clock={clock} />);
  act(() => clock.set(4.5));
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('Salut.'), { block: 'nearest' });
});

it('does not move while the reader selects text, then follows again', () => {
  const clock = createPlaybackClock(1);
  render(<TranscriptHarness meeting={meeting} clock={clock} />);
  document.getSelection()?.selectAllChildren(screen.getByText('Bonjour.'));
  scrolled.mockClear();
  act(() => clock.set(4.5));
  expect(scrolled).not.toHaveBeenCalled();
  document.getSelection()?.removeAllRanges();
  act(() => clock.set(7.5));
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('On commence.'), { block: 'nearest' });
});

it('does not move while the pointer is held in the transcript', () => {
  const clock = createPlaybackClock(1);
  render(<TranscriptHarness meeting={meeting} clock={clock} />);
  fireEvent.pointerDown(screen.getByText('Bonjour.'));
  scrolled.mockClear();
  act(() => clock.set(4.5));
  expect(scrolled).not.toHaveBeenCalled();
  fireEvent.pointerUp(window);
  act(() => clock.set(7.5));
  expect(scrolled).toHaveBeenCalled();
});

it('stays put when the reader left the follow', () => {
  const clock = createPlaybackClock(1);
  render(<TranscriptHarness meeting={meeting} clock={clock} following={false} />);
  scrolled.mockClear();
  act(() => clock.set(4.5));
  expect(scrolled).not.toHaveBeenCalled();
});

function placeActive(top: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect(
    this: Element,
  ) {
    const span = this.matches('[aria-current="time"]')
      ? { top, bottom: top + 60 }
      : { top: 0, bottom: 600 };
    return DOMRect.fromRect({ x: 0, y: span.top, width: 600, height: span.bottom - span.top });
  });
}

function scroller() {
  const element = document.createElement('div');
  document.body.append(element);
  return { current: element };
}

it('offers « Revenir au direct » when the turn playing is out of view, and goes back to it', async () => {
  placeActive(900);
  render(
    <TranscriptHarness
      meeting={meeting}
      clock={createPlaybackClock(4.5)}
      following={false}
      scroller={scroller()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Revenir au direct' }));
  expect(handlers.onFollow).toHaveBeenCalledOnce();
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('Salut.'), { block: 'center' });
});

it('rechecks the pill when the reader scrolls back to the turn', () => {
  placeActive(900);
  const box = scroller();
  render(
    <TranscriptHarness
      meeting={meeting}
      clock={createPlaybackClock(4.5)}
      following={false}
      scroller={box}
    />,
  );
  expect(screen.getByRole('button', { name: 'Revenir au direct' })).toBeInTheDocument();
  vi.restoreAllMocks();
  placeActive(200);
  fireEvent.scroll(box.current);
  expect(screen.queryByRole('button', { name: 'Revenir au direct' })).toBeNull();
});

it('shows no pill while following, or while the turn playing is in view', () => {
  placeActive(900);
  const { unmount } = render(
    <TranscriptHarness meeting={meeting} clock={createPlaybackClock(4.5)} scroller={scroller()} />,
  );
  expect(screen.queryByRole('button', { name: 'Revenir au direct' })).toBeNull();
  unmount();
  vi.restoreAllMocks();
  placeActive(200);
  render(
    <TranscriptHarness
      meeting={meeting}
      clock={createPlaybackClock(4.5)}
      following={false}
      scroller={scroller()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Revenir au direct' })).toBeNull();
});

it('leaves the follow when the reader moves to a search result', async () => {
  render(<TranscriptHarness meeting={meeting} />);
  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Chercher dans la transcription' }),
    'salut',
  );
  expect(handlers.onRelease).toHaveBeenCalled();
});
