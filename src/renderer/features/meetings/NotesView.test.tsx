// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting, NoteItem, Notes } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { NotesView } from './NotesView';

afterEach(cleanup);

const item = (text: string, sourceIds: string[] = []): NoteItem => ({ text, sourceIds });
const notes: Notes = {
  summary: 'On valide le budget.',
  keyPoints: [item('Budget validé', ['0-0', '1-0', '2-0', '3-0'])],
  decisions: [item('On garde le planning')],
  actions: [item('Envoyer le compte rendu')],
  questions: [item('Qui valide la suite ?')],
};
const analysed = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
  status: 'ready',
  duration: 240,
  audioChunks: [{ index: 0, start: 0, duration: 240, transcript: [] }],
  transcript: [
    { id: '0-0', start: 4, end: 6, text: 'Bonjour.', speaker: 'A' },
    { id: '0-1', start: 4.6, end: 8, text: 'Salut.', speaker: 'B' },
    { id: '1-0', start: 61, end: 63, text: 'Le budget.', speaker: 'A' },
    { id: '2-0', start: 130, end: 133, text: 'Le planning.', speaker: 'B' },
    { id: '3-0', start: 185, end: 190, text: 'La suite.', speaker: 'A' },
  ],
  notes,
});

function renderNotes(meeting: Meeting, analyzing = false) {
  const props = {
    onAnalyze: vi.fn(),
    onSettings: vi.fn(),
    onTimestamp: vi.fn(),
    onClarify: vi.fn(async () => true),
  };
  render(
    <NotesView
      meeting={meeting}
      at={0}
      analyzing={analyzing}
      saving={false}
      clarifyError=""
      {...props}
    />,
  );
  return props;
}

it('reads the five sections in order, then the clarifications', () => {
  renderNotes(analysed);
  expect(
    screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
  ).toEqual(['Résumé', 'Points clés', 'Décisions', 'Actions', 'À clarifier', 'Précisions']);
  expect(screen.getByText('On valide le budget.')).toBeInTheDocument();
});

it('shows every timestamp of a note, not the first three', () => {
  renderNotes(analysed);
  expect(
    screen.getAllByRole('button', { name: /^Écouter à/ }).map((button) => button.textContent),
  ).toEqual(['0:04', '1:01', '2:10', '3:05']);
});

it('plays from a timestamp and hands its source over', async () => {
  const user = userEvent.setup();
  const { onTimestamp } = renderNotes(analysed);
  await user.click(screen.getByRole('button', { name: 'Écouter à 1:01' }));
  expect(onTimestamp).toHaveBeenCalledWith(61, '1-0');
});

it('shows one stamp for sources in the same second and none for unknown ones', () => {
  const welcome = { ...notes, keyPoints: [item('Accueil', ['0-0', '0-1', 'inconnu'])] };
  renderNotes({ ...analysed, notes: welcome });
  expect(screen.getAllByRole('button', { name: /^Écouter à/ })).toHaveLength(1);
});

it('lists the actions as plain bullets', () => {
  renderNotes(analysed);
  expect(screen.getByText('Envoyer le compte rendu').closest('li')).not.toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
});

it('refreshes the notes with the clarifications', async () => {
  const user = userEvent.setup();
  const { onAnalyze } = renderNotes(analysed);
  expect(screen.getByText('Inclut vos précisions enregistrées.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Actualiser les notes' }));
  expect(onAnalyze).toHaveBeenCalledOnce();
});

it('invites to analyse a recorded meeting', async () => {
  const user = userEvent.setup();
  const recorded = meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z', {
    audioChunks: [{ index: 0, start: 0, duration: 60, transcript: null }],
  });
  const { onAnalyze, onSettings } = renderNotes(recorded);
  expect(screen.getByText('Prêt pour l’analyse.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Transcrire et créer le compte rendu' }));
  await user.click(screen.getByRole('button', { name: 'Configurer l’analyse' }));
  expect(onAnalyze).toHaveBeenCalledOnce();
  expect(onSettings).toHaveBeenCalledOnce();
});

it('explains why the analysis cannot start without audio', () => {
  renderNotes(meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z'));
  const button = screen.getByRole('button', { name: 'Transcrire et créer le compte rendu' });
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription('Aucun audio n’a été enregistré.');
});

it('shows no second message while the analysis runs', () => {
  renderNotes(
    meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z', { status: 'processing' }),
    true,
  );
  expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  expect(screen.queryByText(/compte rendu se prépare/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Transcrire et créer le compte rendu' })).toBeNull();
});

it('leaves a failed analysis to the amber band', () => {
  renderNotes(
    meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z', {
      status: 'error',
      error: 'Aucune parole détectée dans cet enregistrement.',
    }),
  );
  expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  expect(screen.getByRole('heading', { level: 2, name: 'Précisions' })).toBeInTheDocument();
});
