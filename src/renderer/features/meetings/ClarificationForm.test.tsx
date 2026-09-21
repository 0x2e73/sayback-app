// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClarificationForm } from './ClarificationForm';

it('keeps the moment field and submits a clarification at the selected time', async () => {
  const onSubmit = vi.fn(async () => true);
  const onTime = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(
    <ClarificationForm
      duration={120}
      at={12}
      disabled={false}
      saving={false}
      onTime={onTime}
      onSubmit={onSubmit}
    />,
  );

  expect(screen.getByText(/Un « ça » un peu flou/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Moment (secondes)'), { target: { value: '45' } });
  expect(onTime).toHaveBeenLastCalledWith(45);
  rerender(
    <ClarificationForm
      duration={120}
      at={45}
      disabled={false}
      saving={false}
      onTime={onTime}
      onSubmit={onSubmit}
    />,
  );
  await user.type(screen.getByLabelText('Votre précision'), 'Le bouton Exporter.');
  await user.click(screen.getByRole('button', { name: 'Ajouter la précision' }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(45, 'Le bouton Exporter.'));
  expect(screen.getByLabelText('Votre précision')).toHaveValue('');
});
