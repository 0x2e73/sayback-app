// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  await user.type(screen.getByRole('searchbox', { name: 'Rechercher une lettre' }), 'ch');
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Charlie']);
  await user.clear(screen.getByRole('searchbox'));
  await user.type(screen.getByRole('searchbox'), 'zzz');
  expect(screen.queryByRole('option')).toBeNull();
  expect(screen.getByText('Rien.')).toBeInTheDocument();
});

it('offers the typed text as a value when custom values are allowed', async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(<Harness searchLabel="Rechercher" allowCustom onChange={change} />);
  await user.click(screen.getByRole('button', { name: /Lettre/ }));
  await user.type(screen.getByRole('searchbox'), 'zeta');
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
