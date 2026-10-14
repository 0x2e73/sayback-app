// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DesktopApi, Result, UpdateInstallOutcome, UpdateStatus } from '../shared/contracts';
import { App } from './App';
import { apiFor, ok, upToDate } from './test-api';

afterEach(cleanup);

const ready: UpdateStatus = {
  ...upToDate,
  available: { version: '0.2.0', commit: 'abcdef0123456789', builtAt: '2026-10-14T10:00:00.000Z' },
};
const blocked: UpdateStatus = {
  ...ready,
  canInstall: false,
  reason: 'Arrêtez l’enregistrement avant d’installer la mise à jour.',
};

function apiWith(status: UpdateStatus): DesktopApi {
  const api = apiFor();
  api.getUpdateStatus = () => ok(status);
  return api;
}

async function pane() {
  return screen.findByRole('complementary', { name: 'Liste des réunions' });
}

it('shows nothing when the app is up to date', async () => {
  render(<App api={apiFor()} />);
  const list = await pane();
  await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
  expect(within(list).queryByText(/Mise à jour/)).toBeNull();
  expect(within(list).queryByRole('button', { name: 'Installer' })).toBeNull();
});

it('offers the install with the short version', async () => {
  render(<App api={apiWith(ready)} />);
  const list = await pane();
  const line = await within(list).findByRole('status', { name: 'Mise à jour' });
  expect(line).toHaveTextContent('Mise à jour prête');
  expect(line).toHaveTextContent('0.2.0 · abcdef0');
  expect(within(line).getByRole('button', { name: 'Installer' })).toBeInTheDocument();
});

it('installs once and keeps the button busy during the call', async () => {
  let finish: (value: Result<UpdateInstallOutcome>) => void = () => undefined;
  const api = apiWith(ready);
  api.installUpdate = vi.fn(
    () => new Promise<Result<UpdateInstallOutcome>>((done) => (finish = done)),
  );
  const user = userEvent.setup();
  render(<App api={api} />);
  const install = await screen.findByRole('button', { name: 'Installer' });
  await user.click(install);
  await user.click(install);
  expect(api.installUpdate).toHaveBeenCalledOnce();
  expect(install).toHaveAttribute('aria-busy', 'true');
  await act(async () => finish({ ok: true, value: 'postponed' }));
  expect(install).not.toHaveAttribute('aria-busy');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('shows the refusal in the floating notice', async () => {
  const api = apiWith(ready);
  api.installUpdate = async () => ({ ok: false, error: 'Le paquet est introuvable.' });
  const user = userEvent.setup();
  render(<App api={api} />);
  await user.click(await screen.findByRole('button', { name: 'Installer' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Le paquet est introuvable.');
});

it('explains why it cannot install, without a button', async () => {
  render(<App api={apiWith(blocked)} />);
  const list = await pane();
  const line = await within(list).findByRole('status', { name: 'Mise à jour' });
  expect(line).toHaveTextContent('Mise à jour prête');
  expect(line).toHaveTextContent(blocked.reason!);
  expect(within(list).queryByRole('button', { name: 'Installer' })).toBeNull();
});

it('shows nothing for a blocked channel without an available update', async () => {
  render(<App api={apiWith({ ...upToDate, canInstall: false, reason: 'Canal fermé.' })} />);
  await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
  expect(screen.queryByText('Canal fermé.')).toBeNull();
});

it('shows a pushed update without reloading', async () => {
  const api = apiFor();
  let emit: (status: UpdateStatus) => void = () => undefined;
  api.onUpdateStatus = (listener) => {
    emit = listener;
    return () => undefined;
  };
  render(<App api={api} />);
  await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
  expect(screen.queryByRole('button', { name: 'Installer' })).toBeNull();
  act(() => emit(ready));
  expect(await screen.findByRole('button', { name: 'Installer' })).toBeInTheDocument();
});
