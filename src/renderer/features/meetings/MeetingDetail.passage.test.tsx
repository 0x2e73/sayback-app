// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AudioChunk, Meeting } from '../../../shared/contracts';
import { apiFor, meetingFixture } from '../../test-api';
import { MeetingDetail } from './MeetingDetail';
import { recordScrolls, turnOf } from './transcript-harness';

let scrolled: ReturnType<typeof recordScrolls>;

beforeEach(() => {
  scrolled = recordScrolls();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chunk = (index: number, start: number): AudioChunk => ({
  index,
  start,
  duration: 60,
  transcript: [],
});
const analysed = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
  status: 'ready',
  duration: 120,
  audioChunks: [chunk(0, 0), chunk(1, 60)],
  transcript: [
    { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
    { id: '1-0', start: 61, end: 63, text: 'Le budget.', speaker: 'A' },
  ],
  clarifications: [{ id: 'c1', at: 90, text: 'Le budget 2027.', createdAt: '' }],
  notes: {
    summary: 'On valide le budget.',
    keyPoints: [{ text: 'Budget validé', sourceIds: ['1-0'] }],
    decisions: [],
    actions: [],
    questions: [],
  },
});

function detail(shown: Meeting) {
  return (
    <MeetingDetail
      meeting={shown}
      api={apiFor([shown])}
      folders={[]}
      onUpdate={vi.fn()}
      onMove={vi.fn(async () => true)}
      onCreateFolder={vi.fn(async () => null)}
      onDeleted={vi.fn()}
      onSettings={vi.fn()}
    />
  );
}

function audio(): HTMLAudioElement {
  const element = document.querySelector('audio');
  if (!element) throw new Error('no audio element');
  return element;
}

it('places the turn playing when the transcript opens', async () => {
  const user = userEvent.setup();
  render(detail(analysed));
  fireEvent.loadedMetadata(audio());
  await user.click(screen.getByRole('button', { name: 'Lire' }));
  audio().currentTime = 1.5;
  fireEvent.timeUpdate(audio());
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(turnOf('Bonjour.')).toHaveAttribute('aria-current', 'time');
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('Bonjour.'), { block: 'nearest' });
});

it('opens the passage of a note in an extract that is not loaded, then goes back to the notes', async () => {
  const user = userEvent.setup();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  render(detail(analysed));
  const scroller = document.querySelector<HTMLElement>('.detail-scroll');
  if (!scroller) throw new Error('no scroll container');
  scroller.scrollTop = 300;
  await user.click(screen.getByRole('button', { name: 'Écouter à 1:01' }));
  expect(screen.getByRole('tab', { name: 'Transcription' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The extract is still loading: the turn is marked and placed already.
  expect(audio()).toHaveAttribute('src', 'meeting-media://local/m1/audio/1');
  expect(turnOf('Le budget.')).toHaveAttribute('aria-current', 'time');
  expect(turnOf('Le budget.')).toHaveAttribute('data-passage');
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('Le budget.'), { block: 'nearest' });
  fireEvent.loadedMetadata(audio());
  expect(audio().currentTime).toBe(1);
  expect(play).toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retour aux notes' }));
  expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
  expect(scroller.scrollTop).toBe(300);
});

it('opens a clarification time no turn holds, plays it and marks nothing', async () => {
  const user = userEvent.setup();
  render(detail(analysed));
  await user.click(screen.getByRole('button', { name: 'Écouter à 1:30' }));
  expect(screen.getByRole('tab', { name: 'Transcription' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(
    screen.getAllByRole('article').filter((turn) => turn.hasAttribute('data-passage')),
  ).toEqual([]);
  expect(screen.getByRole('button', { name: 'Retour aux notes' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mettre en pause' })).toBeInTheDocument();
});
