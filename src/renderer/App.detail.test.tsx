// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AudioChunk, Meeting } from '../shared/contracts';
import { App } from './App';
import { apiFor, meetingFixture, ok, settings } from './test-api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chunk = (index: number, done: boolean): AudioChunk => ({
  index,
  start: index * 60,
  duration: 60,
  transcript: done ? [] : null,
});
const recorded = (id: string, title: string, createdAt: string): Meeting =>
  meetingFixture(id, title, createdAt, { duration: 60, audioChunks: [chunk(0, false)] });
const newer = recorded('new', 'Revue produit', '2026-10-14T08:00:00Z');
const older = recorded('old', 'Point hebdo', '2026-10-12T08:00:00Z');

function processing(done: number): Meeting {
  return meetingFixture('new', 'Revue produit', '2026-10-14T08:00:00Z', {
    status: 'processing',
    duration: 720,
    audioChunks: Array.from({ length: 12 }, (_, index) => chunk(index, index < done)),
  });
}

function audio(): HTMLAudioElement {
  const element = document.querySelector('audio');
  if (!element) throw new Error('no audio element');
  return element;
}

describe('The meeting detail in the app', () => {
  it('analyses a recorded meeting from the notes prompt', async () => {
    const user = userEvent.setup();
    const api = apiFor([newer]);
    api.getSettings = () => ok({ ...settings, hasOpenAiKey: true });
    const analysed: Meeting = {
      ...newer,
      status: 'ready',
      notes: {
        summary: 'On valide le budget.',
        keyPoints: [],
        decisions: [],
        actions: [],
        questions: [],
      },
    };
    const processMeeting = vi.fn(() => ok(analysed));
    api.processMeeting = processMeeting;
    render(<App api={api} />);
    await user.click(
      await screen.findByRole('button', { name: 'Transcrire et créer le compte rendu' }),
    );
    await waitFor(() => expect(processMeeting).toHaveBeenCalledWith('new'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Résumé' })).toBeInTheDocument();
    expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  });

  it('keeps the player and follows the analysis while the list polls', async () => {
    let done = 3;
    const api = apiFor([processing(done)]);
    api.listMeetings = () => ok([processing(done)]);
    render(<App api={api} />);
    expect(
      await screen.findByText('Analyse en cours · 3 segments sur 12', {
        selector: '[role=status]',
      }),
    ).toBeInTheDocument();
    const player = audio();
    const source = player.getAttribute('src');
    done = 4;
    expect(
      await screen.findByText(
        'Analyse en cours · 4 segments sur 12',
        { selector: '[role=status]' },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(audio()).toBe(player);
    expect(audio().getAttribute('src')).toBe(source);
    expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  }, 10_000);

  it('stops the sound and opens the other meeting from the start', async () => {
    const user = userEvent.setup();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    render(<App api={apiFor([older, newer])} />);
    await screen.findByRole('heading', { level: 1, name: 'Revue produit' });
    fireEvent.loadedMetadata(audio());
    await user.click(screen.getByRole('button', { name: 'Lire' }));
    audio().currentTime = 30;
    fireEvent.timeUpdate(audio());
    pause.mockClear();
    await user.click(screen.getByRole('option', { name: /Point hebdo/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Point hebdo' }),
    ).toBeInTheDocument();
    expect(pause).toHaveBeenCalled();
    expect(audio()).toHaveAttribute('src', 'meeting-media://local/old/audio/0');
    expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Position de lecture' })).toHaveAttribute(
      'aria-valuetext',
      '00:00 sur 01:00',
    );
  });

  it('stops the sound when the settings open and comes back at the start', async () => {
    const user = userEvent.setup();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    render(<App api={apiFor([older, newer])} />);
    await screen.findByRole('heading', { level: 1, name: 'Revue produit' });
    fireEvent.loadedMetadata(audio());
    await user.click(screen.getByRole('button', { name: 'Lire' }));
    pause.mockClear();
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    await screen.findByRole('heading', { level: 1, name: 'Paramètres' });
    expect(pause).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Revue produit' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  });
});
