// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Folder, Meeting } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { FolderControl } from './FolderControl';

afterEach(cleanup);

const folders: Folder[] = [
  { id: 'f1', name: 'Acme', createdAt: '' },
  { id: 'f2', name: 'Interne', createdAt: '' },
];
const unfiled = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z');

type CreateFolder = (name: string) => Promise<Folder | null>;

function renderControl(
  meeting: Meeting,
  onCreate: CreateFolder = vi.fn(async (name: string) => ({ id: 'f3', name, createdAt: '' })),
) {
  const onMove = vi.fn();
  render(<FolderControl meeting={meeting} folders={folders} onMove={onMove} onCreate={onCreate} />);
  return { onMove, onCreate };
}

const select = () => screen.getByRole('combobox', { name: 'Dossier de la réunion' });

it('invites to file a meeting that has no folder', () => {
  renderControl(unfiled);
  expect(screen.getByText('Ajouter à un dossier…')).toBeInTheDocument();
  expect(select()).toHaveDisplayValue('Sans dossier');
  expect(
    within(select())
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['Sans dossier', 'Acme', 'Interne', 'Nouveau dossier…']);
});

it('names the folder of the meeting', () => {
  renderControl({ ...unfiled, folderId: 'f1' });
  expect(select()).toHaveDisplayValue('Acme');
  expect(screen.queryByText('Ajouter à un dossier…')).toBeNull();
});

it('creates a folder and files the meeting in it', async () => {
  const user = userEvent.setup();
  const { onMove, onCreate } = renderControl(unfiled);
  await user.selectOptions(select(), 'Nouveau dossier…');
  expect(onMove).not.toHaveBeenCalled();
  await user.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'Clients{Enter}');
  expect(onCreate).toHaveBeenCalledWith('Clients');
  await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith('f3'));
  expect(
    await screen.findByRole('combobox', { name: 'Dossier de la réunion' }),
  ).toBeInTheDocument();
});

it('stays on the field when the folder cannot be created', async () => {
  const user = userEvent.setup();
  const { onMove } = renderControl(
    unfiled,
    vi.fn(async () => null),
  );
  await user.selectOptions(select(), 'Nouveau dossier…');
  await user.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'Clients{Enter}');
  expect(screen.getByRole('textbox', { name: 'Nom du dossier' })).toBeInTheDocument();
  expect(onMove).not.toHaveBeenCalled();
});

it('cancels the new folder with Escape', async () => {
  const user = userEvent.setup();
  const { onCreate } = renderControl(unfiled);
  await user.selectOptions(select(), 'Nouveau dossier…');
  await user.keyboard('{Escape}');
  expect(select()).toBeInTheDocument();
  expect(onCreate).not.toHaveBeenCalled();
});
