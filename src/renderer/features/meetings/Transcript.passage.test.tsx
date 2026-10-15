// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  handlers,
  meetingWith,
  recordScrolls,
  TranscriptHarness,
  turnOf,
} from './transcript-harness';

beforeEach(() => {
  recordScrolls();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const meeting = meetingWith([
  { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
  { id: '0-1', start: 3, end: 5, text: 'On commence.', speaker: 'A' },
  { id: '0-2', start: 5, end: 8, text: 'Salut.', speaker: 'B' },
]);
const marked = () =>
  screen.getAllByRole('article').filter((turn) => turn.hasAttribute('data-passage'));

it('marks the passage reached from a note and offers the way back', async () => {
  render(<TranscriptHarness meeting={meeting} passage={{ sourceId: '0-2', at: 5, key: 1 }} />);
  expect(marked()).toEqual([turnOf('Salut.')]);
  await userEvent.click(screen.getByRole('button', { name: 'Retour aux notes' }));
  expect(handlers.onBackToNotes).toHaveBeenCalledOnce();
});

it('finds the turn of a segment merged into a longer turn', () => {
  render(<TranscriptHarness meeting={meeting} passage={{ sourceId: '0-1', at: 3, key: 1 }} />);
  expect(marked()).toEqual([turnOf('Bonjour. On commence.')]);
});

it('marks the turn at the time of a clarification', () => {
  render(
    <TranscriptHarness
      meeting={meeting}
      passage={{ sourceId: 'clarification:c1', at: 6, key: 1 }}
    />,
  );
  expect(marked()).toEqual([turnOf('Salut.')]);
});

it('marks nothing when no turn holds the moment, and still offers the way back', () => {
  render(
    <TranscriptHarness
      meeting={meeting}
      passage={{ sourceId: 'clarification:c2', at: 90, key: 1 }}
    />,
  );
  expect(marked()).toEqual([]);
  expect(screen.getByRole('button', { name: 'Retour aux notes' })).toBeInTheDocument();
});

it('shows no way back without a passage', () => {
  render(<TranscriptHarness meeting={meeting} />);
  expect(screen.queryByRole('button', { name: 'Retour aux notes' })).toBeNull();
});

it('replays the flash for the same passage asked again, without remounting the turn', () => {
  const { rerender } = render(
    <TranscriptHarness meeting={meeting} passage={{ sourceId: '0-2', at: 5, key: 1 }} />,
  );
  const turn = turnOf('Salut.');
  const first = turn?.firstElementChild;
  rerender(<TranscriptHarness meeting={meeting} passage={{ sourceId: '0-2', at: 5, key: 2 }} />);
  expect(turnOf('Salut.')).toBe(turn);
  expect(turn?.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  expect(turn?.firstElementChild).not.toBe(first);
});
