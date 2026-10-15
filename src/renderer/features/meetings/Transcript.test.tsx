// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import type { Meeting, Segment } from '../../../shared/contracts';
import { Transcript as ControlledTranscript } from './Transcript';
import { meetingMarkdown } from './meeting-format';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

// The search lives in the tab container; this stands in for it.
function Transcript(props: { meeting: Meeting; at: number; onSeek(at: number): void }) {
  const [search, setSearch] = useState('');
  return <ControlledTranscript {...props} search={search} onSearch={setSearch} />;
}

function meetingWith(transcript: Segment[]): Meeting {
  return {
    id: 'm1',
    title: 'Réunion',
    createdAt: '',
    status: 'ready',
    duration: 65,
    hasVideo: false,
    audioChunks: [],
    frames: [],
    transcript,
    notes: null,
    clarifications: [],
    error: null,
  };
}

const meeting = meetingWith([
  { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
  { id: '0-1', start: 4, end: 6, text: 'Salut.', speaker: 'B' },
  { id: '1-0', start: 61, end: 63, text: 'Encore moi.', speaker: 'A' },
]);

it('shows distinct voices within each audio chunk in transcript and export', () => {
  render(<Transcript meeting={meeting} at={0} onSeek={vi.fn()} />);

  expect(screen.getByRole('button', { name: /Intervenant A.*Bonjour/ })).toBeVisible();
  expect(screen.getByRole('button', { name: /Intervenant B.*Salut/ })).toBeVisible();
  expect(screen.getByRole('button', { name: /Intervenant A.*Encore moi/ })).toBeVisible();
  expect(screen.queryByText(/extrait/)).toBeNull();
  expect(meetingMarkdown(meeting)).toContain('[01:01] Intervenant A (partie 2) : Encore moi.');
});

it('réunit les paroles suivies d’un même intervenant en un seul passage', () => {
  const suite = meetingWith([
    { id: '0-0', start: 1, end: 3, text: 'Bonjour à tous.', speaker: 'A' },
    { id: '0-1', start: 3, end: 6, text: 'On commence par le budget.', speaker: 'A' },
    { id: '0-2', start: 6, end: 9, text: 'D’accord.', speaker: 'B' },
  ]);

  render(<Transcript meeting={suite} at={0} onSeek={vi.fn()} />);

  expect(
    screen.getByRole('button', { name: /Bonjour à tous. On commence par le budget./ }),
  ).toBeVisible();
  expect(screen.getAllByRole('button', { name: /Intervenant/ })).toHaveLength(2);
});

it('ramène la lecture au début du passage cliqué', async () => {
  const onSeek = vi.fn();
  render(<Transcript meeting={meeting} at={0} onSeek={onSeek} />);

  await userEvent.click(screen.getByRole('button', { name: /Encore moi/ }));

  expect(onSeek).toHaveBeenCalledWith(61);
});

it('ne garde que les passages contenant le texte cherché', async () => {
  render(<Transcript meeting={meeting} at={0} onSeek={vi.fn()} />);

  await userEvent.type(screen.getByRole('searchbox', { name: /transcription/i }), 'salut');

  expect(screen.getByRole('button', { name: /Salut/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Bonjour/ })).not.toBeInTheDocument();
});

it('explique qu’aucun passage ne correspond à la recherche', async () => {
  render(<Transcript meeting={meeting} at={0} onSeek={vi.fn()} />);

  await userEvent.type(screen.getByRole('searchbox', { name: /transcription/i }), 'absent');

  expect(screen.getByText(/Aucun passage/)).toBeVisible();
});

it('ne propose pas de recherche sans transcription', () => {
  render(<Transcript meeting={meetingWith([])} at={0} onSeek={vi.fn()} />);

  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.getByText(/transcription/i)).toBeVisible();
});
