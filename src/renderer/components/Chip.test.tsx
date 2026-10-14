// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Chip } from './Chip';

afterEach(cleanup);

it('says whether it is the current filter', () => {
  render(
    <>
      <Chip pressed>Tous</Chip>
      <Chip pressed={false}>Acme</Chip>
    </>,
  );
  expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Acme' })).toHaveAttribute('aria-pressed', 'false');
});

it('never submits the form around it', () => {
  const submit = vi.fn((event: Event) => event.preventDefault());
  render(
    <form onSubmit={(event) => submit(event.nativeEvent)}>
      <Chip>Acme</Chip>
    </form>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Acme' }));
  expect(submit).not.toHaveBeenCalled();
});
