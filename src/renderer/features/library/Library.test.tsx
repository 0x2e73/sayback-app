// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting } from '../../../shared/contracts';
import { Library } from './Library';
import { MEETING_DRAG_TYPE } from './FolderBoard';

afterEach(cleanup);

const meeting = (id: string, title: string, folderId?: string): Meeting => ({
  id,
  title,
  folderId,
  createdAt: '2026-09-13T10:00:00.000Z',
  status: 'ready',
  duration: 60,
  hasVideo: false,
  audioChunks: [],
  frames: [],
  transcript: [],
  notes: null,
  clarifications: [],
  error: null,
});

it('searches inside the selected folder and can switch to global search', async () => {
  const user = userEvent.setup();
  render(
    <Library
      meetings={[meeting('a', 'Produit', 'folder'), meeting('b', 'Équipe')]}
      folders={[{ id: 'folder', name: 'Projet', createdAt: '' }]}
      onOpen={vi.fn()}
      onCreateFolder={vi.fn()}
      onRenameFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      onMoveMeeting={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('button', { name: /^Projet1$/ }));
  expect(screen.getByRole('button', { name: /Produit/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Équipe/ })).not.toBeInTheDocument();
  await user.type(screen.getByRole('searchbox', { name: 'Rechercher une réunion' }), 'Équipe');
  expect(screen.getByText('Aucune réunion trouvée.')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Chercher partout' }));
  expect(screen.getByRole('button', { name: /Équipe/ })).toBeInTheDocument();
});

it('moves a meeting by drop or the accessible folder selector', async () => {
  const onMove = vi.fn(async () => true);
  const user = userEvent.setup();
  const view = render(
    <Library
      meetings={[meeting('a', 'Produit')]}
      folders={[{ id: 'folder', name: 'Projet', createdAt: '' }]}
      onOpen={vi.fn()}
      onCreateFolder={vi.fn()}
      onRenameFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      onMoveMeeting={onMove}
    />,
  );
  const target = view.container.querySelector('.folder-entry:not(.folder-unfiled)')!;
  expect(screen.getByRole('button', { name: /^Toutes les réunions1$/ })).not.toHaveAttribute(
    'data-drag-over',
  );
  const transfer = { types: [MEETING_DRAG_TYPE], getData: () => 'a', dropEffect: 'none' };
  fireEvent.dragOver(target, { dataTransfer: transfer });
  expect(target).toHaveAttribute('data-drag-over', 'true');
  fireEvent.drop(target, { dataTransfer: transfer });
  expect(onMove).toHaveBeenCalledWith('a', 'folder');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Dossier de Produit' }), 'folder');
  expect(onMove).toHaveBeenCalledTimes(2);
});

it('creates a named folder from the library', async () => {
  const onCreate = vi.fn(async (name: string) => ({ id: 'new', name, createdAt: '' }));
  const user = userEvent.setup();
  render(
    <Library
      meetings={[]}
      folders={[]}
      onOpen={vi.fn()}
      onCreateFolder={onCreate}
      onRenameFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      onMoveMeeting={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Nouveau dossier' }));
  await user.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'Produit');
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(onCreate).toHaveBeenCalledWith('Produit');
});
