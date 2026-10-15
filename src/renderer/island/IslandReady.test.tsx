// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { opened, readySnapshot, recording, shape, shown } from './island-fixture';

const chip = (name: string) => screen.getByRole('button', { name });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 15, 11, 42));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ready island', () => {
  it('opens on the frame after it is drawn compact', async () => {
    await shown(readySnapshot());
    expect(screen.queryByRole('button', { name: 'Démarrer' })).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(50));
    expect(screen.getByRole('button', { name: 'Démarrer' })).toBeEnabled();
  });

  it('shows the title, the remembered sources and the screen', async () => {
    await opened(
      readySnapshot({ remembered: { microphone: true, systemAudio: true, screen: false } }),
    );
    expect(screen.getByRole('heading', { name: 'Réunion du 15 octobre, 11 h 00' })).toBeVisible();
    expect(chip('Microphone')).toHaveAttribute('aria-pressed', 'true');
    // The system audio exists only with the screen: normalised as the dialog does.
    expect(chip('Son du système')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('Écran')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Écran 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvrir SayBack' })).toBeInTheDocument();
  });

  it('offers « Changer » from two screens only', async () => {
    const island = await opened(readySnapshot({ screenCount: 1 }));
    expect(screen.queryByRole('button', { name: 'Changer' })).not.toBeInTheDocument();
    island.push(readySnapshot({ screen: { id: 'screen:2:0', name: 'Écran 2' }, screenCount: 2 }));
    press('Changer');
    expect(island.request).toHaveBeenLastCalledWith('cycle-screen');
    expect(screen.getByText('Écran 2')).toBeInTheDocument();
  });

  it('closes on × and hands over to the dialog on « Ouvrir SayBack »', async () => {
    const island = await opened(readySnapshot());
    press('Fermer');
    expect(island.request).toHaveBeenLastCalledWith('close');
    press('Ouvrir SayBack');
    expect(island.request).toHaveBeenLastCalledWith('open');
  });

  it('starts with a title of the moment and the chosen screen', async () => {
    const island = await opened(readySnapshot());
    press('Démarrer');
    expect(island.request).toHaveBeenCalledWith({
      type: 'start',
      title: 'Réunion du 15 octobre, 11 h 42',
      selection: { microphone: true, systemAudio: true, screen: true, screenId: 'screen:1:0' },
    });
  });

  it('starts without a screen once the chip is off, which drops the system audio', async () => {
    const island = await opened(readySnapshot());
    fireEvent.click(chip('Écran'));
    press('Démarrer');
    expect(island.request).toHaveBeenCalledWith({
      type: 'start',
      title: 'Réunion du 15 octobre, 11 h 42',
      selection: { microphone: true, systemAudio: false, screen: false },
    });
  });

  it('keeps its own chips when a later state arrives', async () => {
    const island = await opened(readySnapshot());
    fireEvent.click(chip('Microphone'));
    island.push(readySnapshot());
    expect(chip('Microphone')).toHaveAttribute('aria-pressed', 'false');
  });

  it('is busy until the answer and never sends twice', async () => {
    const island = await opened(readySnapshot());
    press('Démarrer');
    press('Démarrer');
    expect(island.request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Démarrer' })).toHaveAttribute('aria-busy', 'true');
    expect(chip('Microphone')).toBeDisabled();
    island.result({ ok: false, error: 'failed' });
    expect(screen.getByRole('button', { name: 'Démarrer' })).not.toHaveAttribute('aria-busy');
    expect(chip('Microphone')).toBeEnabled();
  });

  it('turns a refused request into a failure', async () => {
    const island = await opened(readySnapshot());
    island.request.mockResolvedValueOnce({
      ok: false,
      error: 'Vérifiez les informations saisies.',
    });
    press('Démarrer');
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent('L’enregistrement n’a pas démarré.');
    expect(screen.getByRole('button', { name: 'Démarrer' })).not.toHaveAttribute('aria-busy');
  });
});

describe('ready island errors', () => {
  it('replaces the screen line with a refused screen and opens the settings', async () => {
    const island = await opened(readySnapshot());
    press('Démarrer');
    island.result({ ok: false, error: 'screen-denied' });
    const line = screen.getByRole('alert');
    expect(line).toHaveTextContent('Autorisation d’écran refusée.');
    expect(screen.queryByText('Écran 1')).not.toBeInTheDocument();
    fireEvent.click(within(line).getByRole('button', { name: 'Ouvrir les réglages' }));
    expect(island.request).toHaveBeenLastCalledWith('open-privacy-settings');
  });

  it('shows a missing screen from the opening and retries', async () => {
    const island = await opened(
      readySnapshot({ screen: null, screenCount: 0, error: 'no-screen' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Aucun écran détecté.');
    expect(screen.getByRole('button', { name: 'Démarrer' })).toBeDisabled();
    press('Réessayer');
    expect(island.request).toHaveBeenLastCalledWith('cycle-screen');
    island.push(readySnapshot({ screenCount: 1 }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Écran 1')).toBeInTheDocument();
  });

  it('drops a screen error once the screen chip is off', async () => {
    await opened(readySnapshot({ error: 'screen-denied' }));
    fireEvent.click(chip('Écran'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Démarrer' })).toBeEnabled();
  });

  it('asks for an audio source and cannot start without one', async () => {
    await opened(readySnapshot());
    fireEvent.click(chip('Microphone'));
    fireEvent.click(chip('Son du système'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Activez le microphone ou le son du système.',
    );
    expect(screen.getByRole('button', { name: 'Démarrer' })).toBeDisabled();
  });

  it('points to an interrupted recording waiting in SayBack', async () => {
    const island = await opened(readySnapshot());
    press('Démarrer');
    island.result({ ok: false, error: 'interrupted' });
    const line = screen.getByRole('alert');
    expect(line).toHaveTextContent('Un enregistrement interrompu attend dans SayBack.');
    fireEvent.click(within(line).getByRole('button', { name: 'Ouvrir SayBack' }));
    expect(island.request).toHaveBeenLastCalledWith('open');
  });

  it('keeps the error of its start when a later state arrives without one', async () => {
    const island = await opened(readySnapshot());
    press('Démarrer');
    island.result({ ok: false, error: 'screen-denied' });
    island.push(readySnapshot());
    expect(screen.getByRole('alert')).toHaveTextContent('Autorisation d’écran refusée.');
  });

  it('shows no error from before while a start is busy', async () => {
    await opened(readySnapshot({ error: 'screen-denied' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    press('Démarrer');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Écran 1')).toBeInTheDocument();
  });

  it('names a refused screen rather than a missing one', async () => {
    await opened(readySnapshot({ screen: null, screenCount: 0, error: 'screen-denied' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Autorisation d’écran refusée.');
  });

  it('drops the error of its start once the user tries another screen', async () => {
    const island = await opened(readySnapshot());
    press('Démarrer');
    island.result({ ok: false, error: 'no-screen' });
    press('Réessayer');
    island.push(readySnapshot({ screen: { id: 'screen:2:0', name: 'Écran 2' } }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Écran 2')).toBeInTheDocument();
  });

  it('clears the error of the last start when starting again', async () => {
    const island = await opened(readySnapshot());
    press('Démarrer');
    island.result({ ok: false, error: 'failed' });
    expect(screen.getByRole('alert')).toHaveTextContent('L’enregistrement n’a pas démarré.');
    press('Démarrer');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ready island transitions', () => {
  it('cross-fades into the recording island once the recording runs', async () => {
    const island = await opened(readySnapshot());
    press('Démarrer');
    island.result({ ok: true });
    expect(screen.getByRole('button', { name: 'Démarrer' })).toHaveAttribute('aria-busy', 'true');
    island.push({ mode: 'recording', recording: recording(), expanded: true, shape });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:12');
    expect(screen.queryByRole('button', { name: 'Démarrer' })).not.toBeInTheDocument();
  });

  it('removes the ready content once the cross-fade is over, ended or not', async () => {
    const island = await opened(readySnapshot());
    press('Démarrer');
    island.push({ mode: 'recording', recording: recording(), expanded: true, shape });
    expect(screen.getByText('Réunion du 15 octobre, 11 h 00')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(400));
    expect(screen.queryByText('Réunion du 15 octobre, 11 h 00')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('removes the ready content when its fade is cancelled', async () => {
    const island = await opened(readySnapshot());
    island.push({ mode: 'recording', recording: recording(), expanded: true, shape });
    const panel = screen
      .getByText('Réunion du 15 octobre, 11 h 00')
      .closest('[aria-hidden="true"]');
    if (!panel) throw new Error('The leaving ready content is not drawn.');
    fireEvent.transitionCancel(panel);
    expect(screen.queryByText('Réunion du 15 octobre, 11 h 00')).not.toBeInTheDocument();
  });

  it('puts its buttons out of reach as it folds away', async () => {
    const island = await opened(readySnapshot());
    island.expand(false);
    expect(screen.queryByRole('button', { name: 'Démarrer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument();
  });
});
