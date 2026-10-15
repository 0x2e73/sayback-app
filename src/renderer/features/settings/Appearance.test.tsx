// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { apiFor, ok, settings } from '../../test-api';
import type { Appearance } from '../../../shared/contracts';

afterEach(cleanup);

async function openSettings(appearance: Appearance = 'system') {
  const api = apiFor();
  api.getSettings = () => ok({ ...settings, appearance });
  const user = userEvent.setup();
  render(<App api={api} />);
  await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
  const group = await screen.findByRole('radiogroup', { name: 'Apparence' });
  return { api, user, group };
}

it('offers the appearance as three choices, on the stored one', async () => {
  const { group } = await openSettings('light');
  const names = within(group)
    .getAllByRole('radio')
    .map((radio) => radio.textContent);
  expect(names).toEqual(['Système', 'Clair', 'Sombre']);
  expect(within(group).getByRole('radio', { name: 'Clair' })).toBeChecked();
  expect(within(group).getByRole('radio', { name: 'Sombre' })).not.toBeChecked();
});

it('puts the appearance first in the general group, after the analysis', async () => {
  await openSettings();
  const headings = screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);
  expect(headings).toEqual(['Analyse', 'Général']);
  const general = screen.getByRole('region', { name: 'Général' });
  expect(within(general).getByRole('radiogroup', { name: 'Apparence' })).toBeInTheDocument();
  expect(general).toHaveTextContent(/Apparence.*Introduction.*Stockage local/);
});

it('applies the choice at once, without the save button', async () => {
  const { api, user, group } = await openSettings();
  const setAppearance = vi.fn(() => ok(undefined));
  const save = vi.fn(api.saveSettings);
  api.setAppearance = setAppearance;
  api.saveSettings = save;
  await user.click(within(group).getByRole('radio', { name: 'Sombre' }));
  expect(setAppearance).toHaveBeenCalledWith('dark');
  expect(save).not.toHaveBeenCalled();
  expect(within(group).getByRole('radio', { name: 'Sombre' })).toBeChecked();
});

it('does not send the choice that is already active', async () => {
  const { api, user, group } = await openSettings('dark');
  const setAppearance = vi.fn(() => ok(undefined));
  api.setAppearance = setAppearance;
  await user.click(within(group).getByRole('radio', { name: 'Sombre' }));
  expect(setAppearance).not.toHaveBeenCalled();
});

it('keeps the previous choice and says so when the change fails', async () => {
  const { api, user, group } = await openSettings();
  api.setAppearance = () => Promise.resolve({ ok: false, error: 'Apparence indisponible.' });
  await user.click(within(group).getByRole('radio', { name: 'Clair' }));
  expect(await screen.findByText('Apparence indisponible.')).toBeInTheDocument();
  expect(within(group).getByRole('radio', { name: 'Système' })).toBeChecked();
});
