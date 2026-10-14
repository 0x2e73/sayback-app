// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting } from '../../../shared/contracts';
import { Library } from './Library';
import { MEETING_DRAG_TYPE } from './useFolderDrop';

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

const dragTransfer = (meetingId: string) => ({
  types: [MEETING_DRAG_TYPE],
  getData: () => meetingId,
  setData: vi.fn(),
  effectAllowed: 'none',
  dropEffect: 'none',
});

it('marks the row being dragged and clears it when the drag ends', () => {
  render(
    <Library
      meetings={[meeting('a', 'Produit')]}
      folders={[]}
      onOpen={vi.fn()}
      onCreateFolder={vi.fn()}
      onRenameFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      onMoveMeeting={vi.fn()}
    />,
  );
  const row = screen.getByText('Produit').closest('.meeting-row')!;
  fireEvent.dragStart(row, { dataTransfer: dragTransfer('a') });
  expect(row).toHaveClass('is-dragging');
  fireEvent.dragEnd(row);
  expect(row).not.toHaveClass('is-dragging');
});

it('announces where a dropped meeting went', async () => {
  const view = render(
    <Library
      meetings={[meeting('a', 'Produit')]}
      folders={[{ id: 'folder', name: 'Acme', createdAt: '' }]}
      onOpen={vi.fn()}
      onCreateFolder={vi.fn()}
      onRenameFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      onMoveMeeting={vi.fn(async () => true)}
    />,
  );
  const target = view.container.querySelector('.folder-entry:not(.folder-unfiled)')!;
  fireEvent.drop(target, { dataTransfer: dragTransfer('a') });
  expect(await screen.findByRole('status')).toHaveTextContent('Réunion déplacée dans « Acme ».');
});

it('asks in the app before deleting a folder', async () => {
  const onDelete = vi.fn(async () => true);
  const confirmSpy = vi.spyOn(window, 'confirm');
  const user = userEvent.setup();
  render(
    <Library
      meetings={[]}
      folders={[{ id: 'f1', name: 'Acme', createdAt: '' }]}
      onOpen={vi.fn()}
      onCreateFolder={vi.fn()}
      onRenameFolder={vi.fn()}
      onDeleteFolder={onDelete}
      onMoveMeeting={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Supprimer Acme' }));
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(onDelete).not.toHaveBeenCalled();
  await user.click(await screen.findByRole('button', { name: 'Supprimer le dossier' }));
  expect(onDelete).toHaveBeenCalledWith('f1');
});

it('keeps the folder dialog open when the deletion fails', async () => {
  const onDelete = vi.fn(async () => false);
  const user = userEvent.setup();
  render(
    <Library
      meetings={[]}
      folders={[{ id: 'f1', name: 'Acme', createdAt: '' }]}
      onOpen={vi.fn()}
      onCreateFolder={vi.fn()}
      onRenameFolder={vi.fn()}
      onDeleteFolder={onDelete}
      onMoveMeeting={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Supprimer Acme' }));
  await user.click(await screen.findByRole('button', { name: 'Supprimer le dossier' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('La suppression a échoué.');
  expect(screen.getByRole('button', { name: 'Supprimer le dossier' })).toBeEnabled();
});

it('announces two identical drops separately', async () => {
  const view = render(
    <Library
      meetings={[meeting('a', 'Produit')]}
      folders={[{ id: 'folder', name: 'Acme', createdAt: '' }]}
      onOpen={vi.fn()}
      onCreateFolder={vi.fn()}
      onRenameFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      onMoveMeeting={vi.fn(async () => true)}
    />,
  );
  const target = view.container.querySelector('.folder-entry:not(.folder-unfiled)')!;
  fireEvent.drop(target, { dataTransfer: dragTransfer('a') });
  const first = (await screen.findByRole('status')).firstElementChild;
  expect(first).toHaveTextContent('Réunion déplacée dans « Acme ».');
  fireEvent.drop(target, { dataTransfer: dragTransfer('a') });
  await waitFor(() => {
    const second = screen.getByRole('status').firstElementChild;
    expect(second).toHaveTextContent('Réunion déplacée dans « Acme ».');
    expect(second).not.toBe(first);
  });
});

it('ignores a drop on the folder the meeting is already in', () => {
  const onMove = vi.fn(async () => true);
  const view = render(
    <Library
      meetings={[meeting('a', 'Produit', 'folder'), meeting('b', 'Équipe')]}
      folders={[{ id: 'folder', name: 'Acme', createdAt: '' }]}
      onOpen={vi.fn()}
      onCreateFolder={vi.fn()}
      onRenameFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      onMoveMeeting={onMove}
    />,
  );
  const folder = view.container.querySelector('.folder-entry:not(.folder-unfiled)')!;
  const unfiled = view.container.querySelector('.folder-unfiled')!;
  fireEvent.drop(folder, { dataTransfer: dragTransfer('a') });
  fireEvent.drop(unfiled, { dataTransfer: dragTransfer('b') });
  expect(onMove).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('announces a move to a folder deleted meanwhile without naming it', async () => {
  let finishMove: (moved: boolean) => void = () => {};
  const onMove = vi.fn(() => new Promise<boolean>((resolve) => (finishMove = resolve)));
  const props = {
    meetings: [meeting('a', 'Produit')],
    onOpen: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onMoveMeeting: onMove,
  };
  const folders = [{ id: 'folder', name: 'Acme', createdAt: '' }];
  const view = render(<Library {...props} folders={folders} />);
  const target = view.container.querySelector('.folder-entry:not(.folder-unfiled)')!;
  fireEvent.drop(target, { dataTransfer: dragTransfer('a') });
  view.rerender(<Library {...props} folders={[]} />);
  finishMove(true);
  expect(await screen.findByText('Réunion déplacée.')).toBeInTheDocument();
});
