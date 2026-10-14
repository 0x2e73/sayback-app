// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

it('confirms or cancels', () => {
  const confirm = vi.fn();
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
  const confirm = vi.fn();
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
