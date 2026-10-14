// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DesktopApi } from '../shared/contracts';
import { App } from './App';
import { apiFor, meetingFixture, ok } from './test-api';

afterEach(cleanup);

const acme = { id: 'f1', name: 'Acme', createdAt: '' };
const newest = meetingFixture('m3', 'Revue produit', '2026-10-14T08:00:00Z');
const middle = meetingFixture('m2', 'Point hebdo', '2026-10-13T08:00:00Z', { folderId: 'f1' });
const oldest = meetingFixture('m1', 'Rétro sprint', '2026-10-12T08:00:00Z', { folderId: 'f1' });

function apiWithFolder(): DesktopApi {
  const api = apiFor([newest, middle, oldest]);
  api.listFolders = () => ok([acme]);
  return api;
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('The card follows what the list shows', () => {
  it('moves the card to a listed meeting when a folder filter hides the selected one', async () => {
    const user = userEvent.setup();
    render(<App api={apiWithFolder()} />);
    await heading('Revue produit');
    await user.click(await screen.findByRole('button', { name: 'Acme' }));
    expect(await heading('Point hebdo')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Point hebdo/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('moves the card with the search, and says so when nothing is listed', async () => {
    const user = userEvent.setup();
    render(<App api={apiWithFolder()} />);
    await heading('Revue produit');
    const search = screen.getByRole('searchbox', { name: 'Rechercher une réunion' });
    await user.type(search, 'rétro');
    expect(await heading('Rétro sprint')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(await screen.findByText('Aucune réunion sélectionnée')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('keeps the filter when the introduction is replayed', async () => {
    const user = userEvent.setup();
    render(<App api={apiWithFolder()} />);
    await user.type(await screen.findByRole('searchbox'), 'rétro');
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    await user.click(await screen.findByRole('button', { name: 'Revoir l’introduction' }));
    await user.click(await screen.findByRole('button', { name: 'Passer' }));
    expect(await screen.findByRole('searchbox')).toHaveValue('rétro');
  });

  it('follows a meeting moved out of the filtered folder', async () => {
    const api = apiWithFolder();
    api.moveMeeting = (id, folderId) => ok({ ...middle, id, folderId });
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Acme' }));
    await heading('Point hebdo');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Dossier de la réunion' }), '');
    expect(await heading('Rétro sprint')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Point hebdo/ })).toBeNull();
  });
});

describe('After a deletion', () => {
  async function deleteSelected(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Supprimer la réunion' }));
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
  }

  it('selects the next visible meeting, not the most recent one', async () => {
    const user = userEvent.setup();
    render(<App api={apiWithFolder()} />);
    await user.click(await screen.findByRole('option', { name: /Point hebdo/ }));
    await heading('Point hebdo');
    await deleteSelected(user);
    expect(await heading('Rétro sprint')).toBeInTheDocument();
  });

  it('selects the previous one when the last meeting goes', async () => {
    const user = userEvent.setup();
    render(<App api={apiWithFolder()} />);
    await user.click(await screen.findByRole('option', { name: /Rétro sprint/ }));
    await heading('Rétro sprint');
    await deleteSelected(user);
    expect(await heading('Point hebdo')).toBeInTheDocument();
  });

  it('stays inside the filtered folder', async () => {
    const user = userEvent.setup();
    render(<App api={apiWithFolder()} />);
    await user.click(await screen.findByRole('button', { name: 'Acme' }));
    await heading('Point hebdo');
    await deleteSelected(user);
    expect(await heading('Rétro sprint')).toBeInTheDocument();
  });
});

describe('With the settings open', () => {
  it('marks no row, and the arrow keys bring a meeting back', async () => {
    const user = userEvent.setup();
    render(<App api={apiWithFolder()} />);
    await heading('Revue produit');
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    await screen.findByRole('heading', { level: 1, name: 'Paramètres' });
    const pane = screen.getByRole('complementary', { name: 'Liste des réunions' });
    expect(within(pane).queryAllByRole('option', { selected: true })).toHaveLength(0);
    within(pane).getAllByRole('option')[0]?.focus();
    await user.keyboard('{ArrowDown}');
    expect(await heading('Revue produit')).toBeInTheDocument();
    expect(within(pane).getAllByRole('option', { selected: true })).toHaveLength(1);
  });
});
