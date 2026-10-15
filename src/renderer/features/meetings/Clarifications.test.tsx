// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { Clarifications } from './Clarifications';

afterEach(cleanup);

const meeting = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', {
  status: 'ready',
  duration: 120,
  clarifications: [{ id: 'c1', at: 45, text: 'On parle du bouton Exporter.', createdAt: '' }],
});

function renderSection(
  extra: { meeting?: Meeting; disabled?: boolean; submitError?: string } = {},
) {
  const onTimestamp = vi.fn();
  const onSubmit = vi.fn(async () => true);
  render(
    <Clarifications
      meeting={extra.meeting ?? meeting}
      currentTime={() => 30}
      disabled={extra.disabled ?? false}
      saving={false}
      submitError={extra.submitError ?? ''}
      onTimestamp={onTimestamp}
      onSubmit={onSubmit}
    />,
  );
  return { onTimestamp, onSubmit };
}

it('lists the clarifications and plays one from its time', async () => {
  const user = userEvent.setup();
  const { onTimestamp } = renderSection();
  expect(screen.getByRole('heading', { level: 2, name: 'Précisions' })).toBeInTheDocument();
  expect(screen.getByText('On parle du bouton Exporter.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Écouter à 0:45' }));
  expect(onTimestamp).toHaveBeenCalledWith(45, 'clarification:c1');
});

it('opens the form at the playback position and closes it after saving', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderSection();
  await user.click(screen.getByRole('button', { name: 'Ajouter une précision' }));
  expect(screen.getByRole('textbox', { name: 'Moment' })).toHaveValue('00:30');
  await user.type(screen.getByRole('textbox', { name: 'Votre précision' }), 'Le budget.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(onSubmit).toHaveBeenCalledWith(30, 'Le budget.');
  expect(await screen.findByRole('button', { name: 'Ajouter une précision' })).toBeInTheDocument();
});

it('closes the form with « Annuler »', async () => {
  const user = userEvent.setup();
  renderSection();
  await user.click(screen.getByRole('button', { name: 'Ajouter une précision' }));
  await user.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(screen.queryByRole('textbox', { name: 'Votre précision' })).toBeNull();
});

it('cannot add a clarification while the analysis runs', () => {
  renderSection({ disabled: true });
  expect(screen.getByRole('button', { name: 'Ajouter une précision' })).toBeDisabled();
});

it('shows the error of a failed save inside the open form', async () => {
  const user = userEvent.setup();
  renderSection({ submitError: 'Impossible d’enregistrer la précision.' });
  await user.click(screen.getByRole('button', { name: 'Ajouter une précision' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Impossible d’enregistrer la précision.');
});
