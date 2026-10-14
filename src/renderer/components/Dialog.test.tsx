// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
});
afterEach(cleanup);

const dialogElement = () => document.querySelector('dialog')!;

it('closes on a backdrop click but not on a click inside', () => {
  const close = vi.fn();
  render(
    <Dialog title="Nouvelle réunion" onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  fireEvent.click(screen.getByText('Contenu'));
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(dialogElement());
  expect(close).toHaveBeenCalledOnce();
});

it('stays open while busy, whatever the user does', () => {
  const close = vi.fn();
  render(
    <Dialog title="Supprimer cette réunion ?" busy onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  fireEvent.click(dialogElement());
  fireEvent(dialogElement(), new Event('cancel', { cancelable: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
  expect(close).not.toHaveBeenCalled();
});

it('renders a footer when given one', () => {
  render(
    <Dialog title="Titre" footer={<button type="button">Valider</button>} onClose={() => {}}>
      <p>Contenu</p>
    </Dialog>,
  );
  expect(screen.getByRole('button', { name: 'Valider' }).closest('.dialog-footer')).not.toBeNull();
});
