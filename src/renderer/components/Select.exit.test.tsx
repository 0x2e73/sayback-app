// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { slowTransitions } from '../slow-transitions.test-support';
import { Select } from './Select';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('folds its popover out in a fade, inert, before it leaves', async () => {
  slowTransitions();
  const user = userEvent.setup();
  render(
    <>
      <span id="label">Lettre</span>
      <Select
        value="a"
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Bravo' },
        ]}
        labelledBy="label"
        placeholder="Choisir"
        emptyMessage="Rien."
        onChange={() => {}}
      />
    </>,
  );
  await user.click(screen.getByRole('button', { name: 'Lettre Alpha' }));
  const popover = document.querySelector('.select-popover')!;
  expect(popover).toHaveAttribute('data-state', 'open');
  await user.click(screen.getByRole('option', { name: 'Bravo' }));
  expect(popover).toHaveAttribute('data-state', 'closing');
  expect(popover).toHaveAttribute('inert');
  fireEvent.transitionEnd(popover, { propertyName: 'opacity' });
  expect(document.querySelector('.select-popover')).toBeNull();
});
