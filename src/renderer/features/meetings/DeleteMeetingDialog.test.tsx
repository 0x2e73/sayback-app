// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DeleteMeetingDialog } from './DeleteMeetingDialog';

afterEach(cleanup);

const renderDialog = (onDelete: () => Promise<boolean>, onClose = vi.fn()) =>
  render(<DeleteMeetingDialog busy={false} onClose={onClose} onDelete={onDelete} />);

it('closes once the meeting is deleted', async () => {
  const onClose = vi.fn();
  renderDialog(async () => true, onClose);
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

it('stays open with a message when the deletion fails', async () => {
  const onClose = vi.fn();
  renderDialog(async () => false, onClose);
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('La suppression a échoué.');
  expect(onClose).not.toHaveBeenCalled();
});
