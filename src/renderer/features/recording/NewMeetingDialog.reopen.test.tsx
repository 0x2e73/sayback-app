// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { slowTransitions } from '../../slow-transitions';
import { dialogApi } from './new-meeting-fixtures';
import { NewMeetingDialog } from './NewMeetingDialog';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 11, 0));
  slowTransitions();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function dialog(open: boolean) {
  return (
    <NewMeetingDialog
      open={open}
      api={dialogApi()}
      onStart={vi.fn(() => Promise.resolve())}
      onClose={vi.fn()}
      onConfigure={vi.fn()}
    />
  );
}

it('starts a clean form when it is reopened during its exit', async () => {
  const user = userEvent.setup();
  const view = render(dialog(true));
  const title = await screen.findByLabelText('Titre');
  await waitFor(() => expect(title).toBeEnabled());
  await user.clear(title);
  await user.type(title, 'Brouillon');
  view.rerender(dialog(false));
  expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('data-state', 'closing');
  view.rerender(dialog(true));
  const fresh = await screen.findByLabelText('Titre');
  await waitFor(() => expect(fresh).toHaveValue('Réunion du 15 octobre, 11 h 00'));
});
