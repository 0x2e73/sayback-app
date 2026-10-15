// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, type SelectOption } from './Select';

afterEach(cleanup);

const options: SelectOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
];

function Harness(
  props: Partial<Parameters<typeof Select>[0]> & { onChange?(value: string): void },
) {
  return (
    <>
      <span id="label">Lettre</span>
      <Select
        value="a"
        options={options}
        labelledBy="label"
        placeholder="Choisir"
        emptyMessage="Rien."
        onChange={() => {}}
        {...props}
      />
    </>
  );
}

it('is named by its label then its value, and closed at first', () => {
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Lettre Alpha' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('shows the placeholder when the value is not an option', () => {
  render(<Harness value="" />);
  expect(screen.getByRole('button', { name: 'Lettre Choisir' })).toBeInTheDocument();
});

it('opens on the chosen option and picks one with a click', async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(<Harness onChange={change} />);
  await user.click(screen.getByRole('button', { name: /Lettre/ }));
  expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
  await user.click(screen.getByRole('option', { name: 'Bravo' }));
  expect(change).toHaveBeenCalledWith('b');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(screen.getByRole('button', { name: /Lettre/ })).toHaveFocus();
});

it('moves with the arrows, picks with Enter and leaves with Escape', async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(<Harness onChange={change} />);
  screen.getByRole('button', { name: /Lettre/ }).focus();
  await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(change).toHaveBeenCalledWith('b');
  await user.keyboard('{ArrowDown}{Escape}');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(change).toHaveBeenCalledOnce();
});

it('filters with its search field and says when nothing matches', async () => {
  const user = userEvent.setup();
  render(<Harness searchLabel="Rechercher une lettre" />);
  await user.click(screen.getByRole('button', { name: /Lettre/ }));
  await user.type(screen.getByRole('combobox', { name: 'Rechercher une lettre' }), 'ch');
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Charlie']);
  await user.clear(screen.getByRole('combobox'));
  await user.type(screen.getByRole('combobox'), 'zzz');
  expect(screen.queryByRole('option')).toBeNull();
  expect(screen.getByText('Rien.')).toBeInTheDocument();
});

it('offers the typed text as a value when custom values are allowed', async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(<Harness searchLabel="Rechercher" allowCustom onChange={change} />);
  await user.click(screen.getByRole('button', { name: /Lettre/ }));
  await user.type(screen.getByRole('combobox'), 'zeta');
  await user.click(screen.getByRole('option', { name: 'Utiliser « zeta »' }));
  expect(change).toHaveBeenCalledWith('zeta');
});

it('closes when the focus leaves', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Harness />
      <button type="button">Ailleurs</button>
    </>,
  );
  await user.click(screen.getByRole('button', { name: /Lettre/ }));
  await user.click(screen.getByRole('button', { name: 'Ailleurs' }));
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('never submits the form around it with Enter in the search field', async () => {
  const submit = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
  const user = userEvent.setup();
  render(
    <form onSubmit={submit}>
      <Harness searchLabel="Rechercher" />
    </form>,
  );
  await user.click(screen.getByRole('button', { name: /Lettre/ }));
  await user.type(screen.getByRole('combobox'), 'zzz{Enter}');
  await user.clear(screen.getByRole('combobox'));
  await user.keyboard('{Enter}');
  expect(submit).not.toHaveBeenCalled();
});

it('leaves the keys of an IME composition alone', async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(<Harness searchLabel="Rechercher" onChange={change} />);
  await user.click(screen.getByRole('button', { name: /Lettre/ }));
  const search = screen.getByRole('combobox');
  fireEvent.keyDown(search, { key: 'Enter', keyCode: 229, isComposing: true });
  fireEvent.keyDown(search, { key: 'Escape', keyCode: 229 });
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByRole('listbox')).toBeInTheDocument();
});

it('keeps Escape for itself, so a dialog around it stays open', async () => {
  const outer = vi.fn();
  const user = userEvent.setup();
  render(
    <div onKeyDown={outer}>
      <Harness searchLabel="Rechercher" />
    </div>,
  );
  await user.click(screen.getByRole('button', { name: /Lettre/ }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(outer).not.toHaveBeenCalled();
});

it('opens upward when there is no room below', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: /Lettre/ });
  trigger.getBoundingClientRect = () =>
    ({ top: 600, bottom: 632, height: 32 }) as unknown as DOMRect;
  await user.click(trigger);
  expect(document.querySelector('.select-popover')).toHaveAttribute('data-upward');
});

it('brings the highlighted option back into range when the list shrinks', async () => {
  const user = userEvent.setup();
  render(<Harness searchLabel="Rechercher" />);
  await user.click(screen.getByRole('button', { name: /Lettre/ }));
  await user.keyboard('{ArrowDown}{ArrowDown}');
  await user.type(screen.getByRole('combobox'), 'br');
  expect(screen.getByRole('option', { name: 'Bravo' })).toHaveAttribute('data-active');
});
