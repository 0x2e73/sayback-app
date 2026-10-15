// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { apiFor, ok, settings } from '../../test-api';

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
