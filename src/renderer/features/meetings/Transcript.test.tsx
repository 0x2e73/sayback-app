// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Segment } from '../../../shared/contracts';
import { meetingMarkdown } from './meeting-format';
import { createPlaybackClock } from './playback-clock';
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

const voices = meetingWith([
  { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
  { id: '0-1', start: 4, end: 6, text: 'Salut.', speaker: 'B' },
  { id: '1-0', start: 601, end: 603, text: 'Encore moi.', speaker: 'A' },
]);

it('labels each voice « Intervenant A » and marks each new part', () => {
  render(<TranscriptHarness meeting={voices} />);
  expect(screen.getAllByText('Intervenant A')).toHaveLength(2);
  expect(screen.getAllByText('Intervenant B')).toHaveLength(1);
  expect(screen.queryByText(/extrait/)).toBeNull();
  expect(screen.getByRole('heading', { name: 'Partie 2 · 10:00' })).toBeInTheDocument();
  expect(
    screen.getByText('Les intervenants sont identifiés séparément dans chaque partie.'),
  ).toBeInTheDocument();
  expect(meetingMarkdown(voices)).toContain('[10:01] Intervenant A (partie 2) : Encore moi.');
});

it('explains the parts once, under the first separator', () => {
  const three = meetingWith([
    ...voices.transcript,
    { id: '2-0', start: 1201, end: 1203, text: 'Fin.', speaker: 'B' },
  ]);
  render(<TranscriptHarness meeting={three} />);
  expect(screen.getByRole('heading', { name: 'Partie 3 · 20:00' })).toBeInTheDocument();
  expect(
    screen.getAllByText('Les intervenants sont identifiés séparément dans chaque partie.'),
  ).toHaveLength(1);
});

it('shows neither label, dot nor part without any speaker', () => {
  render(
    <TranscriptHarness
      meeting={meetingWith([
        { id: '0-0', start: 1, end: 3, text: 'Un.' },
        { id: '1-0', start: 601, end: 603, text: 'Deux.' },
      ])}
    />,
  );
  expect(screen.getByText('Un.')).toBeInTheDocument();
  expect(screen.queryByText(/Intervenant/)).toBeNull();
  expect(screen.queryByRole('heading', { name: /Partie/ })).toBeNull();
  expect(screen.queryByText(/identifiés séparément/)).toBeNull();
});

it('labels a single speaker and still marks the parts', () => {
  render(
    <TranscriptHarness
      meeting={meetingWith([
        { id: '0-0', start: 1, end: 3, text: 'Un.', speaker: 'A' },
        { id: '1-0', start: 601, end: 603, text: 'Deux.', speaker: 'A' },
      ])}
    />,
  );
  expect(screen.getAllByText('Intervenant A')).toHaveLength(2);
  expect(screen.getByRole('heading', { name: 'Partie 2 · 10:00' })).toBeInTheDocument();
});

it('réunit les paroles suivies d’un même intervenant en un seul passage', () => {
  render(
    <TranscriptHarness
      meeting={meetingWith([
        { id: '0-0', start: 1, end: 3, text: 'Bonjour à tous.', speaker: 'A' },
        { id: '0-1', start: 3, end: 6, text: 'On commence par le budget.', speaker: 'A' },
        { id: '0-2', start: 6, end: 9, text: 'D’accord.', speaker: 'B' },
      ])}
    />,
  );
  expect(screen.getByText('Bonjour à tous. On commence par le budget.')).toBeInTheDocument();
  expect(screen.getAllByText(/^Intervenant/)).toHaveLength(2);
});

it('continues a monologue cut at 900 characters without a new label', () => {
  const long: Segment[] = Array.from({ length: 12 }, (_segment, index) => ({
    id: `0-${index}`,
    start: index * 10,
    end: index * 10 + 10,
    text: `${index}${'x'.repeat(99)}`,
    speaker: 'A',
  }));
  render(<TranscriptHarness meeting={meetingWith(long)} />);
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getAllByText('Intervenant A')).toHaveLength(1);
});

it('ramène la lecture au début du passage cliqué', async () => {
  render(<TranscriptHarness meeting={voices} />);
  await userEvent.click(screen.getByRole('button', { name: 'Lire à partir de 10:01' }));
  expect(handlers.onSeek).toHaveBeenCalledWith(601);
});

it('lets the text be selected: a turn is no button, its time is', () => {
  render(<TranscriptHarness meeting={voices} />);
  expect(screen.queryByRole('button', { name: /Bonjour/ })).toBeNull();
  expect(screen.getByText('Bonjour.').tagName).toBe('P');
  expect(screen.getByRole('button', { name: 'Lire à partir de 0:01' })).toBeInTheDocument();
});

it('marks the turn playing, and none in a silence', () => {
  const clock = createPlaybackClock(4.5);
  render(<TranscriptHarness meeting={voices} clock={clock} />);
  expect(turnOf('Salut.')).toHaveAttribute('aria-current', 'time');
  expect(turnOf('Bonjour.')).not.toHaveAttribute('aria-current');
  act(() => clock.set(10));
  expect(
    screen.getAllByRole('article').filter((turn) => turn.hasAttribute('aria-current')),
  ).toEqual([]);
});

it('waits for the transcript during the analysis', () => {
  render(<TranscriptHarness meeting={meetingWith([], { status: 'processing' })} analyzing />);
  expect(screen.getByText('La transcription arrive au fur et à mesure.')).toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).toBeNull();
});

it('keeps saying the transcript is coming while turns arrive', () => {
  render(<TranscriptHarness meeting={voices} analyzing />);
  expect(screen.getByText('Bonjour.')).toBeInTheDocument();
  expect(screen.getByText('La transcription arrive au fur et à mesure.')).toBeInTheDocument();
});

it('offers the analysis instead of a search when there is no transcript', async () => {
  render(<TranscriptHarness meeting={meetingWith([], { status: 'recorded' })} />);
  expect(screen.queryByRole('searchbox')).toBeNull();
  expect(screen.getByText('Pas encore de transcription')).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Transcrire et créer le compte rendu' }),
  );
  expect(handlers.onAnalyze).toHaveBeenCalledOnce();
});

it('cannot analyse without audio', () => {
  render(<TranscriptHarness meeting={meetingWith([], { status: 'recorded', audioChunks: [] })} />);
  expect(
    screen.getByRole('button', { name: 'Transcrire et créer le compte rendu' }),
  ).toBeDisabled();
  expect(screen.getByText('Aucun audio n’a été enregistré.')).toBeInTheDocument();
});

it('leaves a failed analysis to the band above the tabs', () => {
  const { container } = render(
    <TranscriptHarness meeting={meetingWith([], { status: 'error', error: 'Aucune parole.' })} />,
  );
  expect(container).toBeEmptyDOMElement();
});

it('writes the time of a turn past the first hour with its hours', () => {
  render(
    <TranscriptHarness
      meeting={meetingWith([{ id: '2-0', start: 3723, end: 3725, text: 'Tard.', speaker: 'A' }])}
    />,
  );
  expect(screen.getByRole('button', { name: 'Lire à partir de 1:02:03' })).toHaveTextContent(
    '1:02:03',
  );
});
