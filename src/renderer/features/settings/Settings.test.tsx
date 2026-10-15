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

it('groups the settings under Analyse and Général, and the local mode only when it applies', async () => {
  await openSettings();
  expect(screen.getByRole('region', { name: 'Analyse' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Général' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Mode local' })).toBeNull();
});

it('shows placeholders until the stored settings are read', async () => {
  const api = apiFor();
  api.getSettings = vi
    .fn()
    .mockReturnValueOnce(ok(settings))
    .mockReturnValue(new Promise(() => {}));
  await openSettings(api);
  expect(screen.getByRole('region', { name: 'Analyse' }).closest('form')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(screen.queryByLabelText('Clé API OpenAI')).toBeNull();
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
});

it('keeps Enregistrer disabled until something changes, then confirms the save', async () => {
  const { user } = await openSettings();
  const save = await screen.findByRole('button', { name: 'Enregistrer' });
  expect(save).toBeDisabled();
  await user.type(screen.getByLabelText('Clé API OpenAI'), 'sk-x');
  expect(save).toBeEnabled();
  await user.click(save);
  expect(await screen.findByText('Enregistré')).toBeInTheDocument();
  expect(save).toBeDisabled();
});

it('takes the confirmation back as soon as the form changes again', async () => {
  const { user } = await openSettings();
  await user.type(await screen.findByLabelText('Clé API OpenAI'), 'sk-x');
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await screen.findByText('Enregistré');
  await user.type(screen.getByLabelText('Clé API OpenAI'), 'y');
  expect(screen.queryByText('Enregistré')).toBeNull();
});

it('sends one request when Enregistrer is pressed twice', async () => {
  const api = apiFor();
  const save = vi.fn(() => ok({ ...settings, hasOpenAiKey: true }));
  api.saveSettings = save;
  const { user } = await openSettings(api);
  await user.type(await screen.findByLabelText('Clé API OpenAI'), 'sk-x');
  const button = screen.getByRole('button', { name: 'Enregistrer' });
  await user.dblClick(button);
  expect(save).toHaveBeenCalledOnce();
});

it('speaks of the address of the API, not of its base URL', async () => {
  const { user } = await openSettings();
  await user.click(await screen.findByRole('button', { name: /^Compte rendu/ }));
  await user.click(screen.getByRole('option', { name: 'API compatible OpenAI' }));
  expect(screen.getByLabelText('Adresse de l’API (compatible OpenAI)')).toBeInTheDocument();
  expect(screen.queryByText(/chat\/completions|whisper-cli|ffmpeg/)).toBeNull();
});

it('does not take a key made of spaces for a change, nor for a key', async () => {
  const { user } = await openSettings();
  await user.type(await screen.findByLabelText('Clé API OpenAI'), '   ');
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
});

it('says so when the stored model is no longer offered, and keeps a compatible one', async () => {
  const api = apiFor();
  api.getSettings = () => ok({ ...settings, hasOpenAiKey: true, model: 'gone' });
  await openSettings(api);
  expect(
    await screen.findByText('Le modèle « gone » n’est plus proposé, choisissez-en un.'),
  ).toBeInTheDocument();
  cleanup();
  const compatible = apiFor();
  compatible.getSettings = () =>
    ok({
      ...settings,
      notesProvider: 'compatible',
      hasCompatibleKey: true,
      compatibleBaseUrl: 'https://x.test/v1',
      model: 'mine/custom',
    });
  await openSettings(compatible);
  expect(await screen.findByRole('button', { name: /mine\/custom/ })).toBeInTheDocument();
  expect(screen.queryByText(/n’est plus proposé/)).toBeNull();
});

it('brings the stored model back when returning to the stored provider', async () => {
  const api = apiFor();
  api.getSettings = () => ok({ ...settings, hasOpenAiKey: true, model: 'gpt-4o' });
  const { user } = await openSettings(api);
  await screen.findByRole('button', { name: /^Modèle pour les notes gpt-4o/ });
  await chooseOption(user, 'Compte rendu', 'Ollama · local');
  expect(
    screen.getByRole('button', { name: /^Modèle pour les notes Choisir/ }),
  ).toBeInTheDocument();
  await chooseOption(user, 'Compte rendu', 'OpenAI');
  expect(
    await screen.findByRole('button', { name: /^Modèle pour les notes gpt-4o/ }),
  ).toBeInTheDocument();
});

it('refuses to save without a model when no key is being added', async () => {
  const api = apiFor();
  api.getSettings = () => ok({ ...settings, hasOpenAiKey: true, model: '' });
  const save = vi.fn(api.saveSettings);
  api.saveSettings = save;
  const { user } = await openSettings(api);
  await chooseOption(user, 'Transcription de l’audio', 'Local · whisper.cpp');
  await user.type(screen.getByLabelText(/Modèle Whisper local/), '/models/ggml-small.bin');
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findByText('Choisissez un modèle pour les notes.')).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});

it('forgets the typed keys as soon as they are stored, even if the model list then fails', async () => {
  const api = apiFor();
  api.saveSettings = () => ok({ ...settings, hasOpenAiKey: true });
  api.listModels = () => Promise.reject(new Error('Réseau coupé'));
  const { user } = await openSettings(api);
  await user.type(await screen.findByLabelText('Clé API OpenAI'), 'sk-new');
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await screen.findAllByText(/modèles restent indisponibles|Réseau coupé/);
  expect(screen.getByLabelText('Clé API OpenAI')).toHaveValue('');
  expect(screen.getByText('Clé protégée sur cet ordinateur')).toBeInTheDocument();
});

it('shows only the failure and a retry when the settings cannot be read', async () => {
  const api = apiFor();
  const read = vi
    .fn()
    .mockReturnValueOnce(ok(settings))
    .mockImplementationOnce(() => Promise.reject(new Error('Lecture impossible')))
    .mockReturnValue(ok(settings));
  api.getSettings = read;
  const { user } = await openSettings(api);
  expect(await screen.findByText('Lecture impossible')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Analyse' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(await screen.findByRole('region', { name: 'Analyse' })).toBeInTheDocument();
});
