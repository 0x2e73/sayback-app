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

it('stays focusable and inert while busy', () => {
  const click = vi.fn();
  render(
    <Button busy onClick={click}>
      Supprimer
    </Button>,
  );
  const button = screen.getByRole('button', { name: 'Supprimer' });
  expect(button).not.toBeDisabled();
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(button).toHaveAttribute('aria-busy', 'true');
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  expect(click).not.toHaveBeenCalled();
});

it('does not submit a form while busy', () => {
  const submit = vi.fn((event: Event) => event.preventDefault());
  render(
    <form onSubmit={(event) => submit(event.nativeEvent)}>
      <Button type="submit" busy>
        Enregistrer
      </Button>
    </form>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(submit).not.toHaveBeenCalled();
});

it('keeps native disabling for the disabled prop', () => {
  const click = vi.fn();
  render(
    <Button disabled onClick={click}>
      Exporter
    </Button>,
  );
  const button = screen.getByRole('button', { name: 'Exporter' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(click).not.toHaveBeenCalled();
});

it('is not marked busy when idle', () => {
  render(<Button>Exporter</Button>);
  expect(screen.getByRole('button', { name: 'Exporter' })).not.toHaveAttribute('aria-busy');
});

it('takes a pill or a round shape', () => {
  render(
    <>
      <Button shape="pill">Démarrer l’enregistrement</Button>
      <Button shape="round" aria-label="Paramètres">
        ⚙
      </Button>
    </>,
  );
  expect(screen.getByRole('button', { name: 'Démarrer l’enregistrement' })).toHaveClass(
    'button-pill',
  );
  expect(screen.getByRole('button', { name: 'Paramètres' })).toHaveClass('button-round');
});
