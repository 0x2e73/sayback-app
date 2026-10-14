// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Folder } from '../../../shared/contracts';
import { acme, actionsWith, Harness, openMenu } from './folder-filter-harness';

afterEach(cleanup);

function rect(left: number): DOMRect {
  return {
    x: left,
    y: 0,
    width: 60,
    height: 24,
    top: 0,
    right: left + 60,
    bottom: 24,
    left,
    toJSON: () => ({}),
  };
}

it('hangs the menu under the chip that opened it', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return rect(this.classList.contains('folder-filter') ? 20 : 120);
  });
  const user = userEvent.setup();
  render(<Harness folders={[acme]} actions={actionsWith()} />);
  await openMenu(user, 'Acme');
  expect(screen.getByRole('menu')).toHaveStyle({ left: '100px' });
  vi.restoreAllMocks();
});

it('turns the vertical wheel into a sideways scroll when the chips overflow', () => {
  render(<Harness folders={[acme]} actions={actionsWith()} />);
  const row = screen.getByRole('group', { name: 'Dossiers' });
  Object.defineProperty(row, 'scrollWidth', { value: 600, configurable: true });
  Object.defineProperty(row, 'clientWidth', { value: 300, configurable: true });
  fireEvent.wheel(row, { deltaY: 40 });
  expect(row.scrollLeft).toBe(40);
  fireEvent.wheel(row, { deltaX: 30, deltaY: 5 });
  expect(row.scrollLeft).toBe(40);
});

it('leaves the wheel alone when the chips fit', () => {
  render(<Harness folders={[acme]} actions={actionsWith()} />);
  const row = screen.getByRole('group', { name: 'Dossiers' });
  Object.defineProperty(row, 'scrollWidth', { value: 200, configurable: true });
  Object.defineProperty(row, 'clientWidth', { value: 300, configurable: true });
  fireEvent.wheel(row, { deltaY: 40 });
  expect(row.scrollLeft).toBe(0);
});

it('keeps the + chip outside the row that scrolls', () => {
  render(<Harness folders={[acme]} actions={actionsWith()} />);
  const row = screen.getByRole('group', { name: 'Dossiers' });
  expect(within(row).queryByRole('button', { name: 'Nouveau dossier' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Nouveau dossier' })).toBeInTheDocument();
});

it.each([[''], ['   ']])('asks for a name when Enter is pressed on %j', async (typed) => {
  const create = vi.fn(async () => null);
  const user = userEvent.setup();
  render(<Harness folders={[]} actions={actionsWith({ create })} />);
  await user.click(screen.getByRole('button', { name: 'Nouveau dossier' }));
  await user.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), `${typed}{Enter}`);
  expect(screen.getByText('Donnez un nom au dossier.')).toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
  await user.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'A');
  expect(screen.queryByText('Donnez un nom au dossier.')).toBeNull();
});

it('ignores Escape while the folder is being created', async () => {
  let finish: (folder: Folder | null) => void = () => {};
  const create = vi.fn(() => new Promise<Folder | null>((resolve) => (finish = resolve)));
  const user = userEvent.setup();
  render(<Harness folders={[]} actions={actionsWith({ create })} />);
  await user.click(screen.getByRole('button', { name: 'Nouveau dossier' }));
  await user.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'Produit{Enter}');
  await user.keyboard('{Escape}');
  expect(screen.getByRole('textbox', { name: 'Nom du dossier' })).toBeInTheDocument();
  finish({ id: 'new', name: 'Produit', createdAt: '' });
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nom du dossier' })).toBeNull());
});

it('starts a fresh field, focused, when a creation follows a rename', async () => {
  const user = userEvent.setup();
  render(<Harness folders={[acme]} actions={actionsWith()} />);
  await openMenu(user, 'Acme');
  await user.click(screen.getByRole('menuitem', { name: 'Renommer' }));
  expect(screen.getByRole('textbox', { name: 'Nom du dossier' })).toHaveValue('Acme');
  await user.click(screen.getByRole('button', { name: 'Nouveau dossier' }));
  const field = screen.getByRole('textbox', { name: 'Nom du dossier' });
  expect(field).toHaveValue('');
  expect(field).toHaveFocus();
});
