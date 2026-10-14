// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailNotices } from './DetailNotices';
import { detailNotices } from './detail-notices';

afterEach(cleanup);

const failed = detailNotices(
  { status: 'error', error: 'Aucune parole détectée dans cet enregistrement.' },
  '',
  false,
);

it('retries a failed analysis from the amber band', async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(<DetailNotices notices={failed} canRetry onRetry={onRetry} />);
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('L’analyse n’a pas abouti.');
  expect(alert).toHaveTextContent('Aucune parole détectée dans cet enregistrement.');
  await user.click(within(alert).getByRole('button', { name: 'Réessayer l’analyse' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

it('explains why a failed meeting without audio cannot be retried', () => {
  render(<DetailNotices notices={failed} canRetry={false} onRetry={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Réessayer l’analyse' })).toBeDisabled();
  expect(screen.getByText('Aucun audio n’a été enregistré.')).toBeInTheDocument();
});

it('renders nothing without notices', () => {
  const { container } = render(<DetailNotices notices={[]} canRetry onRetry={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});
