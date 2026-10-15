// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { apiFor, ok, settings } from '../../test-api';

afterEach(cleanup);

async function openSettings(islandLiveText = true) {
  const api = apiFor();
  api.getSettings = () => ok({ ...settings, islandLiveText });
  const user = userEvent.setup();
  render(<App api={api} />);
  await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
  const general = await screen.findByRole('region', { name: 'Général' });
  const toggle = await within(general).findByRole('switch', {
    name: 'Afficher le texte en direct dans l’îlot',
  });
  return { api, user, general, toggle };
}

it('shows the stored choice in the general group, after the appearance', async () => {
  const { general, toggle } = await openSettings(false);
  expect(toggle).not.toBeChecked();
  expect(general).toHaveTextContent(/Apparence.*Texte en direct.*Introduction/);
});

it('stores the choice at once, without the save button', async () => {
  const { api, user, toggle } = await openSettings();
  const setIslandLiveText = vi.fn(() => ok(undefined));
  const save = vi.fn(api.saveSettings);
  api.setIslandLiveText = setIslandLiveText;
  api.saveSettings = save;
  await user.click(toggle);
  expect(setIslandLiveText).toHaveBeenCalledWith(false);
  expect(save).not.toHaveBeenCalled();
  expect(toggle).not.toBeChecked();
});

it('is locked while the choice is stored, and keeps the previous one when it fails', async () => {
  const { api, user, toggle } = await openSettings();
  let answer: (result: { ok: false; error: string }) => void = () => {};
  api.setIslandLiveText = () => new Promise((resolve) => (answer = resolve));
  await user.click(toggle);
  expect(toggle).toBeDisabled();
  answer({ ok: false, error: 'Réglage indisponible.' });
  expect(await screen.findByText('Réglage indisponible.')).toBeInTheDocument();
  expect(toggle).toBeEnabled();
  expect(toggle).toBeChecked();
});
