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
