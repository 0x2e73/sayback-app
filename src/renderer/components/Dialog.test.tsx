// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const dialogElement = () => document.querySelector('dialog')!;

it('closes on a backdrop click but not on a click inside', () => {
  const close = vi.fn();
  render(
    <Dialog title="Nouvelle réunion" onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  fireEvent.pointerDown(screen.getByText('Contenu'));
  fireEvent.click(screen.getByText('Contenu'));
  expect(close).not.toHaveBeenCalled();
  fireEvent.pointerDown(dialogElement());
  fireEvent.click(dialogElement());
  expect(close).toHaveBeenCalledOnce();
});

it('ignores a drag that starts inside and ends on the backdrop', () => {
  const close = vi.fn();
  render(
    <Dialog title="Nouvelle réunion" onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  fireEvent.pointerDown(screen.getByText('Contenu'));
  fireEvent.click(dialogElement());
  expect(close).not.toHaveBeenCalled();
});

it('ignores the second click of a double click', () => {
  const close = vi.fn();
  render(
    <Dialog title="Nouvelle réunion" onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  fireEvent.pointerDown(dialogElement());
  fireEvent.click(dialogElement(), { detail: 2 });
  expect(close).not.toHaveBeenCalled();
});

it('reopens when the browser closes it natively while busy', () => {
  const close = vi.fn();
  render(
    <Dialog title="Supprimer" busy onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  dialogElement().open = false;
  fireEvent(dialogElement(), new Event('close'));
  expect(showModal).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
});

it('reports a native close when idle', () => {
  const close = vi.fn();
  render(
    <Dialog title="Titre" onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  dialogElement().open = false;
  fireEvent(dialogElement(), new Event('close'));
  expect(close).toHaveBeenCalledOnce();
});

it('gives the focus back to the element that opened it', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const view = render(
    <Dialog title="Titre" onClose={() => {}}>
      <input aria-label="Champ" autoFocus />
    </Dialog>,
  );
  expect(screen.getByLabelText('Champ')).toHaveFocus();
  view.unmount();
  expect(opener).toHaveFocus();
  opener.remove();
});

it('stays open while busy, whatever the user does', () => {
  const close = vi.fn();
  render(
    <Dialog title="Supprimer cette réunion ?" busy onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  fireEvent.pointerDown(dialogElement());
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
