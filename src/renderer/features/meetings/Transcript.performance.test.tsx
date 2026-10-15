// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Segment } from '../../../shared/contracts';
import { shortTimeLabel } from './detail-format';
import { createPlaybackClock } from './playback-clock';
import { meetingWith, recordScrolls, TranscriptHarness } from './transcript-harness';

vi.mock('./detail-format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./detail-format')>();
  return { ...actual, shortTimeLabel: vi.fn(actual.shortTimeLabel) };
});

beforeEach(() => {
  recordScrolls();
});

afterEach(cleanup);

const turnRenders = () => vi.mocked(shortTimeLabel).mock.calls.length;

// 1 000 turns in one part: two voices alternate, so every segment is its own turn.
const segments: Segment[] = Array.from({ length: 1000 }, (_segment, index) => ({
  id: `0-${index}`,
  start: index * 5,
  end: index * 5 + 5,
  text: index % 100 === 0 ? `Point budget ${index}.` : `Phrase ${index} de la réunion.`,
  speaker: index % 2 ? 'B' : 'A',
}));
const long = meetingWith(segments, { duration: 5000, audioChunks: [] });
const copy = () =>
  meetingWith(
    segments.map((segment) => ({ ...segment })),
    { duration: 5000, audioChunks: [] },
  );

it('renders each of 1 000 turns once, and none again for a poll with equal segments', () => {
  vi.mocked(shortTimeLabel).mockClear();
  const { rerender } = render(<TranscriptHarness meeting={long} />);
  expect(turnRenders()).toBe(1000);
  rerender(<TranscriptHarness meeting={copy()} />);
  expect(turnRenders()).toBe(1000);
});

it('renders only the new turn when a poll adds a segment', () => {
  const { rerender } = render(<TranscriptHarness meeting={long} />);
  vi.mocked(shortTimeLabel).mockClear();
  const more = meetingWith(
    [...segments, { id: '0-1000', start: 5000, end: 5005, text: 'Dernier mot.', speaker: 'A' }],
    { duration: 5005, audioChunks: [] },
  );
  rerender(<TranscriptHarness meeting={more} />);
  expect(turnRenders()).toBe(1);
});

it('renders no turn for a tick inside a turn, and two when the turn changes', () => {
  const clock = createPlaybackClock(2500);
  render(<TranscriptHarness meeting={long} clock={clock} />);
  vi.mocked(shortTimeLabel).mockClear();
  act(() => clock.set(2501));
  act(() => clock.set(2502.5));
  expect(turnRenders()).toBe(0);
  act(() => clock.set(2505));
  expect(turnRenders()).toBe(2);
});

it('renders only the turns that gain or lose a match while typing', async () => {
  render(<TranscriptHarness meeting={long} />);
  vi.mocked(shortTimeLabel).mockClear();
  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Chercher dans la transcription' }),
    'budget',
  );
  // « b », « bu »… each keystroke touches the ten « Point budget » turns at most.
  expect(turnRenders()).toBeLessThanOrEqual(10 * 'budget'.length);
  expect(screen.getByText('1 sur 10')).toBeInTheDocument();
});
