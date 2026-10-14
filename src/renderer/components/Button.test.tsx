// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

afterEach(cleanup);

it('does not submit a form unless asked to', () => {
  const submit = vi.fn((event: Event) => event.preventDefault());
  render(
    <form onSubmit={(event) => submit(event.nativeEvent)}>
      <Button>Annuler</Button>
      <Button type="submit">Enregistrer</Button>
    </form>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(submit).toHaveBeenCalledOnce();
});

it('keeps its label while busy and blocks clicks', () => {
  const click = vi.fn();
  render(
    <Button busy onClick={click}>
      Supprimer
    </Button>,
  );
  const button = screen.getByRole('button', { name: 'Supprimer' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(button);
  expect(click).not.toHaveBeenCalled();
});

it('is not marked busy when idle', () => {
  render(<Button>Exporter</Button>);
  expect(screen.getByRole('button', { name: 'Exporter' })).not.toHaveAttribute('aria-busy');
});
