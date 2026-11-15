// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { apiFor, ok, settings } from '../../test-api';
import { chooseOption } from '../../select.test-support';

afterEach(cleanup);

async function openSettings(api = apiFor()) {
  const user = userEvent.setup();
  render(<App api={api} />);
  await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
  return { api, user };
}

it('offers Claude Code and Codex, and says where the text goes before anything is saved', async () => {
  const api = apiFor();
  api.listModels = vi.fn(() => ok(['default', 'sonnet']));
  const { user } = await openSettings(api);

  await chooseOption(user, 'Compte rendu', 'Claude Code · votre abonnement');
  expect(
    await screen.findByText(/Les notes sont rédigées par Claude Code avec votre compte/),
  ).toHaveTextContent('la transcription est envoyée à Anthropic');
  expect(api.listModels).toHaveBeenLastCalledWith('claude-code');
  expect(screen.queryByLabelText('Clé API Claude')).toBeNull();

  await chooseOption(user, 'Compte rendu', 'Codex · votre abonnement');
  expect(
    await screen.findByText(/Les notes sont rédigées par Codex avec votre compte/),
  ).toHaveTextContent('la transcription et les captures d’écran sont envoyées à OpenAI');
  expect(api.listModels).toHaveBeenLastCalledWith('codex');
});

it('preselects the default model and saves with no key', async () => {
  const api = apiFor();
  api.getSettings = () =>
    ok({ ...settings, transcriptionProvider: 'local', whisperModelPath: '/models/ggml-base.bin' });
  api.listModels = () => ok(['default', 'sonnet', 'opus']);
  const save = vi.fn(() =>
    ok({ ...settings, notesProvider: 'claude-code' as const, model: 'default' }),
  );
  api.saveSettings = save;
  const { user } = await openSettings(api);

  await chooseOption(user, 'Compte rendu', 'Claude Code · votre abonnement');
  expect(
    await screen.findByRole('button', { name: /^Modèle pour les notes Modèle par défaut/ }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      notesProvider: 'claude-code',
      model: 'default',
      openAiKey: '',
      anthropicKey: '',
    }),
  );
});

it('says in French when the CLI is missing or logged out, and lets the user try again', async () => {
  const api = apiFor();
  const list = vi
    .fn()
    .mockRejectedValueOnce(new Error('Claude Code n’est pas installé.'))
    .mockResolvedValue({ ok: true, value: ['default'] });
  api.listModels = list;
  const { user } = await openSettings(api);

  await chooseOption(user, 'Compte rendu', 'Claude Code · votre abonnement');
  expect(await screen.findByText(/Claude Code n’est pas installé\./)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Réessayer' }));

  expect(await screen.findByRole('button', { name: /^Modèle pour les notes/ })).toBeInTheDocument();
  expect(screen.queryByText(/n’est pas installé/)).toBeNull();
});
