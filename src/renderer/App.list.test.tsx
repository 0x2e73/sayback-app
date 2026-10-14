// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { apiFor, meetingFixture, ok } from './test-api';

afterEach(cleanup);

const older = meetingFixture('old', 'Point hebdo', '2026-10-12T08:00:00Z');
const newer = meetingFixture('new', 'Revue produit', '2026-10-14T08:00:00Z');

describe('Meeting list and card', () => {
  it('filters persisted meetings without creating sample data', async () => {
    const fixture = meetingFixture('m1', 'Revue produit', '2026-09-11T10:00:00Z');
    const user = userEvent.setup();
    render(<App api={apiFor([fixture])} />);
    const pane = await screen.findByRole('complementary', { name: 'Liste des réunions' });
    expect(await within(pane).findByRole('option', { name: /Revue produit/ })).toBeInTheDocument();
    await user.type(
      within(pane).getByRole('searchbox', { name: 'Rechercher une réunion' }),
      'Budget',
    );
    expect(within(pane).queryByRole('option')).toBeNull();
    expect(within(pane).getByText('Aucune réunion pour « Budget »')).toBeInTheDocument();
  });

  it('keeps loading instead of claiming an empty library when the first load fails', async () => {
    const api = apiFor();
    const fixture = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z');
    let failing = true;
    api.listMeetings = async () =>
      failing ? { ok: false, error: 'Lecture impossible' } : { ok: true, value: [fixture] };
    const user = userEvent.setup();
    render(<App api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger vos réunions.',
    );
    expect(screen.getByText('Chargement des réunions…')).toBeInTheDocument();
    expect(screen.queryByText('Aucune réunion')).toBeNull();
    expect(screen.queryByText('Enregistrez votre première réunion')).toBeNull();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('option', { name: /Revue produit/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('holds the search, the folders, the list and its footer in the left pane', async () => {
    render(<App api={apiFor()} />);
    const pane = await screen.findByRole('complementary', { name: 'Liste des réunions' });
    const band = pane.firstElementChild;
    expect(band).toHaveClass('window-band');
    expect(band).toContainElement(
      within(pane).getByRole('searchbox', { name: 'Rechercher une réunion' }),
    );
    expect(within(pane).getByRole('group', { name: 'Dossiers' })).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Paramètres' })).toBeEnabled();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('selects the most recent meeting on first load', async () => {
    render(<App api={apiFor([older, newer])} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Revue produit' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Revue produit/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('follows the arrow keys from the list to the detail', async () => {
    const user = userEvent.setup();
    render(<App api={apiFor([older, newer])} />);
    await user.click(await screen.findByRole('option', { name: /Revue produit/ }));
    await user.keyboard('{ArrowDown}');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Point hebdo' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Point hebdo/ })).toHaveFocus();
  });

  it('falls back to the most recent meeting when the selected one is deleted', async () => {
    const api = apiFor([older, newer]);
    const deleteMeeting = vi.fn(() => ok(undefined));
    api.deleteMeeting = deleteMeeting;
    const user = userEvent.setup();
    render(<App api={api} />);
    await screen.findByRole('heading', { level: 1, name: 'Revue produit' });
    await user.click(screen.getByRole('button', { name: 'Supprimer la réunion' }));
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
    expect(deleteMeeting).toHaveBeenCalledWith('new');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Point hebdo' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Revue produit/ })).toBeNull();
  });

  it('opens the settings in the card and returns to a meeting from the list', async () => {
    const user = userEvent.setup();
    render(<App api={apiFor([older, newer])} />);
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Paramètres' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paramètres' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('option', { name: /Point hebdo/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Point hebdo' }),
    ).toBeInTheDocument();
  });

  it('returns to the selected meeting when the settings button is pressed again', async () => {
    const user = userEvent.setup();
    render(<App api={apiFor([older, newer])} />);
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
    await screen.findByRole('heading', { level: 1, name: 'Paramètres' });
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Revue produit' }),
    ).toBeInTheDocument();
  });

  it('files the selected meeting from its header', async () => {
    const api = apiFor([newer]);
    api.listFolders = () => ok([{ id: 'f1', name: 'Acme', createdAt: '' }]);
    const move = vi.fn((_id: string, folderId: string | null) => ok({ ...newer, folderId }));
    api.moveMeeting = move;
    const user = userEvent.setup();
    render(<App api={api} />);
    const select = await screen.findByRole('combobox', { name: 'Dossier de la réunion' });
    await within(select).findByRole('option', { name: 'Acme' });
    await user.selectOptions(select, 'Acme');
    expect(move).toHaveBeenCalledWith('new', 'f1');
    expect(await screen.findByRole('option', { name: /Revue produit.*Acme/ })).toBeInTheDocument();
  });
});
