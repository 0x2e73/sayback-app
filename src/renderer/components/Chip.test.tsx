// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { read } from '../design-tokens-support';
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

it('takes an icon as a child and the medium size', () => {
  render(
    <Chip size="md" pressed>
      <svg data-testid="icon" aria-hidden="true" />
      Microphone
    </Chip>,
  );
  const chip = screen.getByRole('button', { name: 'Microphone' });
  expect(chip).toContainElement(screen.getByTestId('icon'));
  expect(chip).toHaveAttribute('data-size', 'md');
});

it('draws the medium chip 32 px high, in the accent tint when on', () => {
  const sheet = read('styles/chip.css');
  expect(sheet).toMatch(/\.chip\[data-size='md'\]\s*\{[^}]*height:\s*var\(--control-sm\)/);
  expect(sheet).toMatch(
    /\.chip\[data-size='md'\]\[aria-pressed='true'\]\s*\{[^}]*background:\s*var\(--color-accent-tint\)/,
  );
});
