// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(cleanup);

function Broken(): never {
  throw new RangeError('Invalid time value');
}

it('shows a message and a reload button instead of a blank window', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const reload = vi.fn();
  render(
    <ErrorBoundary onReload={reload}>
      <Broken />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('L’affichage a rencontré un problème.');
  fireEvent.click(screen.getByRole('button', { name: 'Recharger' }));
  expect(reload).toHaveBeenCalledOnce();
});

it('renders its children when nothing fails', () => {
  render(
    <ErrorBoundary>
      <p>Tout va bien</p>
    </ErrorBoundary>,
  );
  expect(screen.getByText('Tout va bien')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});
