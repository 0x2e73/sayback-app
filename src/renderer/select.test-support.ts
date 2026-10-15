import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Opens the `Select` named by its label, then picks an option. */
export async function chooseOption(user: UserEvent, select: string, option: string): Promise<void> {
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${select}`) }));
  await user.click(screen.getByRole('option', { name: option }));
}
