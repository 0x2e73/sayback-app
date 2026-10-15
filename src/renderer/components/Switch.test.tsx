// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './Switch';

afterEach(cleanup);

it('is a labelled switch that reports its state', () => {
  render(<Switch label="Lancer l’analyse" checked onChange={() => {}} />);
  expect(screen.getByRole('switch', { name: 'Lancer l’analyse' })).toBeChecked();
});

it('asks for the opposite state on a click and on the space bar', async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(<Switch label="Analyse" checked={false} onChange={change} />);
  await user.click(screen.getByRole('switch', { name: 'Analyse' }));
  expect(change).toHaveBeenLastCalledWith(true);
  await user.keyboard(' ');
  expect(change).toHaveBeenCalledTimes(2);
});

it('describes itself with its caption', () => {
  render(<Switch label="Analyse" description="Tout reste ici." checked onChange={() => {}} />);
  expect(screen.getByRole('switch', { name: 'Analyse' })).toHaveAccessibleDescription(
    'Tout reste ici.',
  );
});

it('does nothing while disabled', async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(<Switch label="Analyse" checked disabled onChange={change} />);
  await user.click(screen.getByRole('switch', { name: 'Analyse' }));
  expect(change).not.toHaveBeenCalled();
});
