// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { slowTransitions } from '../slow-transitions';
import { Dialog } from './Dialog';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

it('keeps the heading and the footer out of the scrolling body', () => {
  render(
    <Dialog title="Titre" footer={<button type="button">Valider</button>} onClose={() => {}}>
      <p>Contenu</p>
    </Dialog>,
  );
  const body = screen.getByText('Contenu').closest('.dialog-body');
  expect(body).not.toBeNull();
  expect(body).not.toContainElement(screen.getByRole('heading', { name: 'Titre' }));
  expect(body).not.toContainElement(screen.getByRole('button', { name: 'Valider' }));
});

it('puts the focus on the element it is told to', () => {
  function Harness() {
    const field = useRef<HTMLInputElement>(null);
    return (
      <Dialog title="Titre" initialFocus={field} onClose={() => {}}>
        <input aria-label="Champ" ref={field} />
      </Dialog>
    );
  }
  render(<Harness />);
  expect(screen.getByLabelText('Champ')).toHaveFocus();
});

it('lets Escape undo something before it closes', () => {
  const close = vi.fn();
  const undo = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
  render(
    <Dialog title="Titre" onEscape={undo} onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  fireEvent(dialogElement(), new Event('cancel', { cancelable: true }));
  expect(close).not.toHaveBeenCalled();
  fireEvent(dialogElement(), new Event('cancel', { cancelable: true }));
  expect(close).toHaveBeenCalledOnce();
});

function Harness({ open }: { open: boolean }) {
  return (
    <>
      <button type="button">Ouvrir</button>
      <Dialog title="Nouvelle réunion" open={open} onClose={vi.fn()}>
        <p>Contenu</p>
      </Dialog>
    </>
  );
}

function slowExit(): void {
  vi.useFakeTimers();
  slowTransitions();
}

it('plays its exit before it leaves, then hands the focus back to the opener', () => {
  slowExit();
  const view = render(<Harness open={false} />);
  const opener = screen.getByRole('button', { name: 'Ouvrir' });
  opener.focus();
  view.rerender(<Harness open />);
  expect(dialogElement()).toHaveAttribute('data-state', 'open');
  view.rerender(<Harness open={false} />);
  expect(dialogElement()).toHaveAttribute('data-state', 'closing');
  fireEvent.transitionEnd(dialogElement(), { propertyName: 'opacity' });
  expect(document.querySelector('dialog')).toBeNull();
  expect(opener).toHaveFocus();
});

it('answers nothing while it leaves: Enter on a confirm button cannot fire twice', () => {
  slowExit();
  const view = render(<Harness open />);
  expect(dialogElement()).not.toHaveAttribute('inert');
  view.rerender(<Harness open={false} />);
  expect(dialogElement()).toHaveAttribute('inert');
});
