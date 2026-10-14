// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DesktopApi, Meeting } from '../shared/contracts';
import { App } from './App';
import { apiFor, meetingFixture, ok, settings } from './test-api';

const capture = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('./features/recording/capture-session', () => ({
  CaptureSession: { start: capture.start },
}));

const finished = meetingFixture('rec', 'Revue du vendredi', '2026-10-14T09:00:00Z');
const analysed: Meeting = { ...finished, status: 'ready' };

class FakeSession {
  elapsed = 723;
  paused = false;
  displayStream = null;
  source = undefined;
  meeting = { ...finished, status: 'recording' as const };
  analyser = { frequencyBinCount: 4, getByteFrequencyData: () => {} };
  stop = vi.fn(async () => finished);
  togglePause = vi.fn();
}

let session: FakeSession;

function configuredApi(): DesktopApi {
  const api = apiFor([meetingFixture('old', 'Point hebdo', '2026-10-12T08:00:00Z')]);
  api.getSettings = () => ok({ ...settings, hasOpenAiKey: true });
  api.getSources = () =>
    ok([{ id: 'screen:1:0', name: 'Écran principal', thumbnail: 'data:image/png;base64,a' }]);
  api.processMeeting = vi.fn(() => ok(analysed));
  return api;
}

async function startRecording(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Démarrer l’enregistrement' }));
  await user.type(await screen.findByLabelText('Titre de la réunion'), 'Revue du vendredi');
  await screen.findByRole('checkbox', { name: /Transcrire et créer le compte rendu/ });
  await user.click(screen.getByRole('button', { name: 'Commencer l’enregistrement' }));
}

beforeEach(() => {
  session = new FakeSession();
  capture.start.mockReset();
  capture.start.mockResolvedValue(session);
});
afterEach(cleanup);

describe('Recording from the list pane', () => {
  it('shows the recording in the card and locks the pane meanwhile', async () => {
    const user = userEvent.setup();
    render(<App api={configuredApi()} />);
    await startRecording(user);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Revue du vendredi' }),
    ).toBeInTheDocument();
    const pane = screen.getByRole('complementary', { name: 'Liste des réunions' });
    expect(within(pane).getByRole('searchbox')).toBeDisabled();
    expect(within(pane).getByRole('button', { name: 'Paramètres' })).toBeDisabled();
    expect(within(pane).getByRole('option', { name: /Point hebdo/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(pane).getByRole('button', { name: /En cours · / })).toBeInTheDocument();
    expect(within(pane).queryByRole('button', { name: 'Démarrer l’enregistrement' })).toBeNull();
  });

  it('opens the finished meeting and analyses it on its own', async () => {
    const api = configuredApi();
    const user = userEvent.setup();
    render(<App api={api} />);
    await startRecording(user);
    await user.click(await screen.findByRole('button', { name: 'Terminer la réunion' }));
    expect(session.stop).toHaveBeenCalledOnce();
    await waitFor(() => expect(api.processMeeting).toHaveBeenCalledWith('rec'));
    const row = await screen.findByRole('option', { name: /Revue du vendredi/ });
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).not.toHaveAttribute('aria-disabled');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Revue du vendredi' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paramètres' })).toBeEnabled();
  });

  it('leaves the analysis to the user when it was switched off', async () => {
    const api = configuredApi();
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Démarrer l’enregistrement' }));
    await user.type(await screen.findByLabelText('Titre de la réunion'), 'Revue du vendredi');
    await user.click(
      await screen.findByRole('checkbox', { name: /Transcrire et créer le compte rendu/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Commencer l’enregistrement' }));
    await user.click(await screen.findByRole('button', { name: 'Terminer la réunion' }));
    expect(await screen.findByRole('option', { name: /Revue du vendredi/ })).toBeInTheDocument();
    expect(api.processMeeting).not.toHaveBeenCalled();
  });

  it('shows an analysis failure in a floating notice', async () => {
    const api = configuredApi();
    api.processMeeting = async () => ({ ok: false, error: 'Clé refusée' });
    api.getMeeting = () => ok(finished);
    const user = userEvent.setup();
    render(<App api={api} />);
    await startRecording(user);
    await user.click(await screen.findByRole('button', { name: 'Terminer la réunion' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clé refusée');
  });

  it('stops by itself after two hours', async () => {
    const user = userEvent.setup();
    render(<App api={configuredApi()} />);
    await startRecording(user);
    await screen.findByRole('button', { name: 'Terminer la réunion' });
    expect(session.stop).not.toHaveBeenCalled();
    session.elapsed = 7200;
    await waitFor(() => expect(session.stop).toHaveBeenCalled());
    expect(await screen.findByRole('option', { name: /Revue du vendredi/ })).toBeInTheDocument();
  });

  it('moves the keyboard into the recording from the running pill', async () => {
    const user = userEvent.setup();
    render(<App api={configuredApi()} />);
    await startRecording(user);
    await user.click(await screen.findByRole('button', { name: /En cours · / }));
    const content = document.getElementById('card-content');
    expect(content).toHaveFocus();
  });

  it('drops the filter and the search so the new meeting is listed and selected', async () => {
    const user = userEvent.setup();
    render(<App api={configuredApi()} />);
    await user.type(await screen.findByRole('searchbox'), 'Point');
    await startRecording(user);
    await user.click(await screen.findByRole('button', { name: 'Terminer la réunion' }));
    const row = await screen.findByRole('option', { name: /Revue du vendredi/ });
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');
  });
});
