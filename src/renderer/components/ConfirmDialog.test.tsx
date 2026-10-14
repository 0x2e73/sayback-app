// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

it('confirms or cancels', () => {
  const confirm = vi.fn(async () => true);
  const close = vi.fn();
  render(
    <ConfirmDialog
      title="Supprimer « Acme » ?"
      confirmLabel="Supprimer le dossier"
      onConfirm={confirm}
      onClose={close}
    >
      Les réunions qu’il contient restent disponibles, sans dossier.
    </ConfirmDialog>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(close).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer le dossier' }));
  expect(confirm).toHaveBeenCalledOnce();
});

it('cannot be confirmed twice or cancelled while busy', () => {
  const confirm = vi.fn(async () => true);
  const close = vi.fn();
  render(
    <ConfirmDialog
      title="Supprimer cette réunion ?"
      confirmLabel="Supprimer"
      busy
      onConfirm={confirm}
      onClose={close}
    >
      Texte
    </ConfirmDialog>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

const renderConfirm = (onConfirm: () => boolean | Promise<boolean>, busy = false) =>
  render(
    <ConfirmDialog
      title="Supprimer cette réunion ?"
      confirmLabel="Supprimer"
      busy={busy}
      onConfirm={onConfirm}
      onClose={vi.fn()}
    >
      Texte
    </ConfirmDialog>,
  );

it('stays open with a message when the deletion fails', async () => {
  renderConfirm(async () => false);
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('La suppression a échoué. Réessayez.');
  expect(screen.getByRole('button', { name: 'Supprimer' })).toBeEnabled();
});

it('treats a rejection as a failure', async () => {
  renderConfirm(() => Promise.reject(new Error('boom')));
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('La suppression a échoué.');
});

it('clears the message when the user tries again', async () => {
  const confirm = vi.fn(async () => false);
  renderConfirm(confirm);
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  await screen.findByRole('alert');
  confirm.mockImplementation(() => new Promise<boolean>(() => {}));
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

it('calls onConfirm once for a synchronous double click', () => {
  const confirm = vi.fn(() => new Promise<boolean>(() => {}));
  renderConfirm(confirm);
  const button = screen.getByRole('button', { name: 'Supprimer' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledOnce();
});

it('announces the deletion in progress', () => {
  renderConfirm(async () => true, true);
  expect(screen.getByRole('status')).toHaveTextContent('Suppression en cours…');
});

it('stays quiet when idle', () => {
  renderConfirm(async () => true);
  expect(screen.queryByRole('status')).toBeNull();
});
