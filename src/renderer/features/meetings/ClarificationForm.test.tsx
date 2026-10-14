// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClarificationForm } from './ClarificationForm';

afterEach(cleanup);

function renderForm(
  onSubmit = vi.fn(async () => true),
  duration = 3130.4,
  at = 252.7,
  submitError = '',
) {
  const onClose = vi.fn();
  render(
    <ClarificationForm
      duration={duration}
      at={at}
      saving={false}
      submitError={submitError}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, onClose };
}

const moment = () => screen.getByRole('textbox', { name: 'Moment' });
const text = () => screen.getByRole('textbox', { name: 'Votre précision' });

it('prefills the moment with the playback position and submits it in seconds', async () => {
  const user = userEvent.setup();
  const { onSubmit, onClose } = renderForm();
  expect(screen.getByText(/Un « ça » un peu flou/)).toBeInTheDocument();
  expect(moment()).toHaveValue('04:12');
  await user.type(text(), 'Le bouton Exporter.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(onSubmit).toHaveBeenCalledWith(252, 'Le bouton Exporter.');
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

it('reads a moment typed as m:ss', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderForm();
  await user.clear(moment());
  await user.type(moment(), '1:5');
  await user.type(text(), 'Le budget.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(onSubmit).toHaveBeenCalledWith(65, 'Le budget.');
});

it('refuses a moment past the end of the meeting', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderForm(
    vi.fn(async () => true),
    120,
    0,
  );
  await user.clear(moment());
  await user.type(moment(), '02:01');
  await user.type(text(), 'Trop tard.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Ce moment dépasse la fin de la réunion (02:00).',
  );
  expect(moment()).toHaveAttribute('aria-invalid', 'true');
  expect(onSubmit).not.toHaveBeenCalled();
});

it('refuses a moment it cannot read, and forgets the error once corrected', async () => {
  const user = userEvent.setup();
  renderForm();
  await user.clear(moment());
  await user.type(moment(), '-1:00');
  await user.type(text(), 'Hein ?');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Indiquez un moment au format mm:ss, par exemple 04:12.',
  );
  await user.type(moment(), '{Backspace}');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('stays open with the draft when saving fails', async () => {
  const user = userEvent.setup();
  const { onClose } = renderForm(vi.fn(async () => false));
  await user.type(text(), 'Le bouton Exporter.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(onClose).not.toHaveBeenCalled();
  expect(text()).toHaveValue('Le bouton Exporter.');
});

it('adds nothing without text', () => {
  renderForm();
  expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
});

it('shows why saving failed under the field and keeps what was typed', () => {
  renderForm(
    vi.fn(async () => false),
    3130.4,
    252.7,
    'Impossible d’enregistrer la précision.',
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Impossible d’enregistrer la précision.');
  expect(text()).toHaveValue('');
});

it('keeps the typed text next to the error of a failed save', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn(async () => false);
  renderForm(onSubmit, 3130.4, 252.7, 'Impossible d’enregistrer la précision.');
  await user.type(text(), 'Le bouton Exporter.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(text()).toHaveValue('Le bouton Exporter.');
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

it('prefills no moment past the end of the meeting', () => {
  renderForm(
    vi.fn(async () => true),
    3130.4,
    4000,
  );
  expect(moment()).toHaveValue('52:10');
});
