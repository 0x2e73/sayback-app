// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { meetingFixture } from '../../test-api';
import { acme, actionsWith, Harness, openMenu } from './folder-filter-harness';
import { MEETING_DRAG_TYPE } from './useFolderDrop';

afterEach(cleanup);

const produit = (folderId?: string) =>
  meetingFixture('a', 'Produit', '2026-10-14T08:00:00.000Z', { folderId });

const dragTransfer = (meetingId: string) => ({
  types: [MEETING_DRAG_TYPE],
  getData: () => meetingId,
  dropEffect: 'none',
});

it('creates a folder from the + chip', async () => {
  const create = vi.fn(async (name: string) => ({ id: 'new', name, createdAt: '' }));
  const user = userEvent.setup();
  render(<Harness folders={[]} actions={actionsWith({ create })} />);
  await user.click(screen.getByRole('button', { name: 'Nouveau dossier' }));
  await user.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'Produit{Enter}');
  expect(create).toHaveBeenCalledWith('Produit');
});

it('drops the new folder field with Escape', async () => {
  const create = vi.fn(async () => null);
  const user = userEvent.setup();
  render(<Harness folders={[]} actions={actionsWith({ create })} />);
  await user.click(screen.getByRole('button', { name: 'Nouveau dossier' }));
  await user.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'Produit{Escape}');
  expect(screen.queryByRole('textbox', { name: 'Nom du dossier' })).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

it('selects a folder first, then opens its menu', async () => {
  const user = userEvent.setup();
  render(<Harness folders={[acme]} actions={actionsWith()} />);
  expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Acme' }));
  expect(screen.getByRole('button', { name: 'Acme' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('menu')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Acme' }));
  expect(screen.getByRole('menuitem', { name: 'Renommer' })).toHaveFocus();
  expect(screen.getByRole('menuitem', { name: 'Supprimer…' })).toBeInTheDocument();
});

it('closes the menu with Escape and gives the focus back to the chip', async () => {
  const user = userEvent.setup();
  render(<Harness folders={[acme]} actions={actionsWith()} />);
  await openMenu(user, 'Acme');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(screen.getByRole('button', { name: 'Acme' })).toHaveFocus();
});

it('renames the selected folder from its menu', async () => {
  const rename = vi.fn(async () => true);
  const user = userEvent.setup();
  render(<Harness folders={[acme]} actions={actionsWith({ rename })} />);
  await openMenu(user, 'Acme');
  await user.click(screen.getByRole('menuitem', { name: 'Renommer' }));
  const field = screen.getByRole('textbox', { name: 'Nom du dossier' });
  expect(field).toHaveValue('Acme');
  await user.clear(field);
  await user.type(field, 'Acme SA{Enter}');
  expect(rename).toHaveBeenCalledWith('folder', 'Acme SA');
});

it('asks in the app before deleting a folder', async () => {
  const remove = vi.fn(async () => true);
  const confirmSpy = vi.spyOn(window, 'confirm');
  const user = userEvent.setup();
  render(<Harness folders={[acme]} actions={actionsWith({ remove })} />);
  await openMenu(user, 'Acme');
  await user.click(screen.getByRole('menuitem', { name: 'Supprimer…' }));
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  await user.click(await screen.findByRole('button', { name: 'Supprimer le dossier' }));
  expect(remove).toHaveBeenCalledWith('folder');
});

it('keeps the folder dialog open when the deletion fails', async () => {
  const user = userEvent.setup();
  render(<Harness folders={[acme]} actions={actionsWith({ remove: vi.fn(async () => false) })} />);
  await openMenu(user, 'Acme');
  await user.click(screen.getByRole('menuitem', { name: 'Supprimer…' }));
  await user.click(await screen.findByRole('button', { name: 'Supprimer le dossier' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('La suppression a échoué.');
  expect(screen.getByRole('button', { name: 'Supprimer le dossier' })).toBeEnabled();
});

it('highlights a chip under a dragged meeting and moves it on drop', () => {
  const move = vi.fn(async () => true);
  render(<Harness folders={[acme]} meetings={[produit()]} actions={actionsWith({ move })} />);
  const target = screen.getByRole('button', { name: 'Acme' });
  expect(screen.getByRole('button', { name: 'Tous' })).not.toHaveAttribute('data-drag-over');
  fireEvent.dragOver(target, { dataTransfer: dragTransfer('a') });
  expect(target).toHaveAttribute('data-drag-over', 'true');
  fireEvent.drop(target, { dataTransfer: dragTransfer('a') });
  expect(move).toHaveBeenCalledWith('a', 'folder');
});

it('announces where a dropped meeting went', async () => {
  render(<Harness folders={[acme]} meetings={[produit()]} actions={actionsWith()} />);
  fireEvent.drop(screen.getByRole('button', { name: 'Acme' }), { dataTransfer: dragTransfer('a') });
  expect(await screen.findByRole('status')).toHaveTextContent('Réunion déplacée dans « Acme ».');
});

it('announces two identical drops separately', async () => {
  render(<Harness folders={[acme]} meetings={[produit()]} actions={actionsWith()} />);
  const target = screen.getByRole('button', { name: 'Acme' });
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
  const move = vi.fn(async () => true);
  const meetings = [produit('folder'), meetingFixture('b', 'Équipe', '2026-10-14T09:00:00.000Z')];
  render(<Harness folders={[acme]} meetings={meetings} actions={actionsWith({ move })} />);
  fireEvent.drop(screen.getByRole('button', { name: 'Acme' }), { dataTransfer: dragTransfer('a') });
  fireEvent.drop(screen.getByRole('button', { name: 'Sans dossier' }), {
    dataTransfer: dragTransfer('b'),
  });
  expect(move).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('announces a move to a folder deleted meanwhile without naming it', async () => {
  let finishMove: (moved: boolean) => void = () => {};
  const move = vi.fn(() => new Promise<boolean>((resolve) => (finishMove = resolve)));
  const actions = actionsWith({ move });
  const view = render(<Harness folders={[acme]} meetings={[produit()]} actions={actions} />);
  fireEvent.drop(screen.getByRole('button', { name: 'Acme' }), { dataTransfer: dragTransfer('a') });
  view.rerender(<Harness folders={[]} meetings={[produit()]} actions={actions} />);
  finishMove(true);
  expect(await screen.findByText('Réunion déplacée.')).toBeInTheDocument();
});

it('gives the focus back to the chip when the deletion dialog is cancelled', async () => {
  const user = userEvent.setup();
  render(<Harness folders={[acme]} actions={actionsWith()} />);
  await openMenu(user, 'Acme');
  await user.click(screen.getByRole('menuitem', { name: 'Supprimer…' }));
  await user.click(await screen.findByRole('button', { name: 'Annuler' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Acme' })).toHaveFocus());
});
