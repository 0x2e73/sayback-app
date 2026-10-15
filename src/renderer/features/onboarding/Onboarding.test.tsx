// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onboarding } from './Onboarding';
import { apiFor } from '../../test-api';

afterEach(cleanup);

function show(onComplete = vi.fn(() => Promise.resolve())) {
  render(<Onboarding api={apiFor()} busy={false} error="" onComplete={onComplete} />);
  return onComplete;
}

it('is one column with no brand, picture or step number', () => {
  show();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Gardez le fil de vos réunions.',
  );
  expect(screen.queryByText(/sayback\./i)).toBeNull();
  expect(screen.queryByText(/Le contexte de chaque conversation/)).toBeNull();
  expect(screen.queryByText(/^0\d —/)).toBeNull();
  expect(document.querySelector('.onboarding-visual, .onboarding-art')).toBeNull();
});

it('tells the step to assistive technology and draws it as a line', async () => {
  const user = userEvent.setup();
  show();
  expect(screen.getByText('Étape 1 sur 4')).toBeInTheDocument();
  const line = document.querySelector<HTMLElement>('.onboarding-progress span');
  expect(line?.style.transform).toBe('scaleX(0.25)');
  await user.click(screen.getByRole('button', { name: 'Continuer' }));
  expect(screen.getByText('Étape 2 sur 4')).toBeInTheDocument();
  expect(line?.style.transform).toBe('scaleX(0.5)');
});

it('moves the focus to the title of each new step', async () => {
  const user = userEvent.setup();
  show();
  await user.click(screen.getByRole('button', { name: 'Continuer' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
});

it('can be skipped from the first step', async () => {
  const user = userEvent.setup();
  const complete = show();
  await user.click(screen.getByRole('button', { name: 'Passer' }));
  expect(complete).toHaveBeenCalledOnce();
});

it('puts the focus back on the title when going back to the first step', async () => {
  const user = userEvent.setup();
  show();
  expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Continuer' }));
  await user.click(screen.getByRole('button', { name: 'Retour' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
});
