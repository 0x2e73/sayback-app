// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

afterEach(cleanup);

it('shows the message and an optional action', () => {
  render(
    <EmptyState title="Aucune réunion pour « Budget »">
      <button type="button">Chercher dans toutes les réunions</button>
    </EmptyState>,
  );
  expect(screen.getByText('Aucune réunion pour « Budget »')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Chercher dans toutes les réunions' })).toBeEnabled();
});
