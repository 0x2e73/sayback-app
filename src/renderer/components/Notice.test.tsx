// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Notice } from './Notice';

afterEach(cleanup);

it('interrupts for a danger notice by default', () => {
  render(<Notice>Impossible de supprimer la réunion.</Notice>);
  expect(screen.getByRole('alert')).toHaveClass('notice', 'notice-danger');
});

it('interrupts for a warning too, it can appear while the page is read', () => {
  render(<Notice tone="warning">L’analyse n’a pas abouti.</Notice>);
  expect(screen.getByRole('alert')).toHaveClass('notice-warning');
});

it('reports information politely', () => {
  render(<Notice tone="info">Enregistrement en cours.</Notice>);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status')).toHaveClass('notice-info');
});

it('floats over the card when asked, keeping its tone', () => {
  render(<Notice floating>Impossible de charger vos réunions.</Notice>);
  expect(screen.getByRole('alert')).toHaveClass('notice-floating', 'notice-danger');
});

it('holds an action next to its message', () => {
  const onRetry = vi.fn();
  render(
    <Notice tone="warning" action={<button onClick={onRetry}>Réessayer l’analyse</button>}>
      L’analyse n’a pas abouti.
    </Notice>,
  );
  const alert = screen.getByRole('alert');
  fireEvent.click(within(alert).getByRole('button', { name: 'Réessayer l’analyse' }));
  expect(onRetry).toHaveBeenCalledOnce();
});
