import { expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

type User = ReturnType<typeof userEvent.setup>;

/** The open « Nouvelle réunion » dialog, once the settings are read: the analysis choice is there. */
export async function newMeetingDialog(): Promise<HTMLElement> {
  const dialog = await screen.findByRole('dialog', { name: 'Nouvelle réunion' });
  await waitFor(() => {
    const choice =
      within(dialog).queryByRole('switch') ?? within(dialog).queryByText(/Analyse non configurée/);
    expect(choice).not.toBeNull();
  });
  return dialog;
}

/** Names the meeting and presses « Démarrer l’enregistrement » once the dialog allows it. */
export async function startFromDialog(user: User, title: string): Promise<void> {
  const dialog = await newMeetingDialog();
  const field = within(dialog).getByLabelText('Titre');
  await user.clear(field);
  await user.type(field, title);
  const start = within(dialog).getByRole('button', { name: 'Démarrer l’enregistrement' });
  await waitFor(() => expect(start).toBeEnabled());
  await user.click(start);
}
