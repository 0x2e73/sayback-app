// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Notice } from './Notice';

afterEach(cleanup);

it('interrupts for a danger notice by default', () => {
  render(<Notice>Impossible de supprimer la réunion.</Notice>);
  expect(screen.getByRole('alert')).toHaveClass('notice', 'notice-danger');
});

it('reports a warning politely', () => {
  render(<Notice tone="warning">L’analyse n’a pas abouti.</Notice>);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status')).toHaveClass('notice-warning');
});
