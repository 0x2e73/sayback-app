// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AudioChunk, DesktopApi, Meeting } from '../../../shared/contracts';
import { apiFor, meetingFixture, ok, settings } from '../../test-api';
import { MeetingDetail } from './MeetingDetail';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chunk = (index: number, start: number, done = false): AudioChunk => ({
  index,
  start,
  duration: 60,
  transcript: done ? [] : null,
});
const meeting = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z');
const analysed = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
  status: 'ready',
  duration: 120,
  audioChunks: [chunk(0, 0, true), chunk(1, 60, true)],
  transcript: [{ id: '1-0', start: 61, end: 63, text: 'Le budget.', speaker: 'A' }],
  notes: {
    summary: 'On valide le budget.',
    keyPoints: [{ text: 'Budget validé', sourceIds: ['1-0'] }],
    decisions: [],
    actions: [],
    questions: [],
  },
});

function detail(shown: Meeting, api: DesktopApi = apiFor([shown]), onDeleted = vi.fn()) {
  return (
    <MeetingDetail
      meeting={shown}
      api={api}
      folders={[]}
      onUpdate={vi.fn()}
      onMove={vi.fn(async () => true)}
      onCreateFolder={vi.fn(async () => null)}
      onDeleted={onDeleted}
      onSettings={vi.fn()}
    />
  );
}

const refreshed = (shown: Meeting): Meeting => ({
  ...shown,
  transcript: [...shown.transcript],
  audioChunks: shown.audioChunks.map((item) => ({ ...item })),
});

function processing(done: number): Meeting {
  return meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
    status: 'processing',
    audioChunks: Array.from({ length: 12 }, (_, index) => chunk(index, index * 60, index < done)),
  });
}

it('opens without a way back: the list is the navigation', () => {
  render(detail(meeting));
  expect(screen.getByRole('heading', { level: 1, name: 'Revue produit' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Toutes les réunions' })).toBeNull();
});

it('hands the deletion over once the meeting is gone', async () => {
  const user = userEvent.setup();
  const onDeleted = vi.fn();
  render(detail(meeting, apiFor([meeting]), onDeleted));
  await user.click(screen.getByRole('button', { name: 'Supprimer la réunion' }));
  await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
  expect(onDeleted).toHaveBeenCalledOnce();
});

it('opens on the notes, with the transcript one arrow away', async () => {
  const user = userEvent.setup();
  render(detail(analysed));
  expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).toBeVisible();
  screen.getByRole('tab', { name: 'Notes' }).focus();
  await user.keyboard('{ArrowRight}');
  const panel = screen.getByRole('tabpanel', { name: 'Transcription' });
  expect(within(panel).getByRole('button', { name: /Le budget/ })).toBeInTheDocument();
  expect(screen.queryByRole('tabpanel', { name: 'Notes' })).toBeNull();
});

it('plays a note from its timestamp, in the extract that holds it', async () => {
  const user = userEvent.setup();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  render(detail(analysed));
  await user.click(screen.getByRole('button', { name: 'Écouter à 1:01' }));
  expect(screen.getByRole('tab', { name: 'Transcription' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const audio = document.querySelector('audio');
  if (!audio) throw new Error('no audio element');
  expect(audio).toHaveAttribute('src', 'meeting-media://local/m1/audio/1');
  fireEvent.loadedMetadata(audio);
  expect(audio.currentTime).toBe(1);
  expect(play).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Mettre en pause' })).toBeInTheDocument();
});

it('offers to retry a failed analysis from the amber band', async () => {
  const user = userEvent.setup();
  const failed = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
    status: 'error',
    error: 'Aucune parole détectée dans cet enregistrement.',
    audioChunks: [chunk(0, 0)],
  });
  const api = apiFor([failed]);
  api.getSettings = () => ok({ ...settings, hasOpenAiKey: true });
  const processMeeting = vi.fn(() => ok({ ...failed, status: 'ready' as const, error: null }));
  api.processMeeting = processMeeting;
  render(detail(failed, api));
  const band = screen.getByRole('alert');
  expect(band).toHaveTextContent('L’analyse n’a pas abouti.');
  expect(band).toHaveTextContent('Aucune parole détectée dans cet enregistrement.');
  expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  await user.click(within(band).getByRole('button', { name: 'Réessayer l’analyse' }));
  await vi.waitFor(() => expect(processMeeting).toHaveBeenCalledWith('m1'));
});

it('keeps the tab and the draft when the poll hands over the same meeting', async () => {
  const user = userEvent.setup();
  const { rerender } = render(detail(analysed));
  await user.click(screen.getByRole('button', { name: 'Ajouter une précision' }));
  await user.type(screen.getByRole('textbox', { name: 'Votre précision' }), 'Le budget 2027');
  rerender(detail(refreshed(analysed)));
  expect(screen.getByRole('textbox', { name: 'Votre précision' })).toHaveValue('Le budget 2027');
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  rerender(detail(refreshed(analysed)));
  expect(screen.getByRole('tab', { name: 'Transcription' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await user.click(screen.getByRole('tab', { name: 'Notes' }));
  expect(screen.getByRole('textbox', { name: 'Votre précision' })).toHaveValue('Le budget 2027');
});

it('follows the analysis as the poll brings new segments', () => {
  const { rerender } = render(detail(processing(3)));
  expect(screen.getByText('Analyse en cours · 3 segments sur 12')).toBeInTheDocument();
  expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  rerender(detail(processing(4)));
  expect(screen.getByText('Analyse en cours · 4 segments sur 12')).toBeInTheDocument();
  expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  rerender(detail(analysed));
  expect(screen.queryByText(/Analyse en cours/)).toBeNull();
  expect(screen.getByRole('heading', { level: 2, name: 'Résumé' })).toBeInTheDocument();
});

it('shows the video at the top, muted, while the audio extracts drive the footer', () => {
  render(detail({ ...analysed, hasVideo: true }));
  const video = document.querySelector('video');
  expect(video).toHaveAttribute('src', 'meeting-media://local/m1/video');
  expect(video?.muted).toBe(true);
  expect(document.querySelector('audio')).toHaveAttribute(
    'src',
    'meeting-media://local/m1/audio/0',
  );
  expect(screen.getByRole('button', { name: 'Lire' })).toBeEnabled();
});

it('lets a video without any audio extract carry the sound alone', () => {
  render(detail({ ...analysed, hasVideo: true, audioChunks: [] }));
  expect(document.querySelector('video')).toHaveAttribute('src', 'meeting-media://local/m1/video');
  expect(document.querySelector('audio')).toBeNull();
  expect(screen.getByRole('button', { name: 'Lire' })).toBeEnabled();
});

it('has no context panel and no audio passage picker', () => {
  render(detail(analysed));
  expect(screen.queryByRole('heading', { name: 'Le contexte' })).toBeNull();
  expect(screen.queryByLabelText('Passage audio')).toBeNull();
});

it('says in the form that a clarification could not be saved, and keeps the text', async () => {
  const user = userEvent.setup();
  const api = apiFor([analysed]);
  api.clarify = async () => ({ ok: false, error: 'Impossible d’enregistrer la précision.' });
  render(detail(analysed, api));
  await user.click(screen.getByRole('button', { name: 'Ajouter une précision' }));
  await user.type(screen.getByRole('textbox', { name: 'Votre précision' }), 'Le budget 2027');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Impossible d’enregistrer la précision.');
  expect(screen.getByRole('textbox', { name: 'Votre précision' }).closest('form')).toContainElement(
    alert,
  );
  expect(screen.getByRole('textbox', { name: 'Votre précision' })).toHaveValue('Le budget 2027');
});
