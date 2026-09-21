// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { apiFor, ok, readySetup, settings } from '../../test-api';

afterEach(cleanup);
describe('Local setup', () => {
  it('sends people to the Ollama guide when it is missing, then checks again', async () => {
    const api = apiFor();
    const openGuide = vi.fn(() => ok(undefined));
    const check = vi
      .fn()
      .mockReturnValueOnce(ok({ ...readySetup, ollama: false, notesModel: false }))
      .mockReturnValue(ok(readySetup));
    api.getSettings = () => ok({ ...settings, onboardingCompleted: false });
    api.checkLocalSetup = check;
    api.openSetupGuide = openGuide;
    const user = userEvent.setup();
    render(<App api={api} />);
    for (let step = 0; step < 3; step += 1) {
      await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    }
    expect(await screen.findByText('Ollama n’est pas démarré')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ouvrir le guide Ollama' }));
    expect(openGuide).toHaveBeenCalledWith('ollama');
    expect(screen.queryByRole('button', { name: 'Ouvrir le guide Whisper' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Revérifier' }));
    expect(await screen.findByText('Le mode local est prêt.')).toBeInTheDocument();
  });
  it('shows the local setup in settings when a local provider is chosen', async () => {
    const api = apiFor();
    api.getSettings = () =>
      ok({ ...settings, transcriptionProvider: 'local', notesProvider: 'ollama' });
    api.checkLocalSetup = () => ok({ ...readySetup, whisperCli: false });
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
    expect(await screen.findByText('whisper-cli est absent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvrir le guide Whisper' })).toBeInTheDocument();
  });
});
