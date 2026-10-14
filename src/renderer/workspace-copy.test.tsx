// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { apiFor } from './test-api';

afterEach(cleanup);
describe('Workspace without marketing copy', () => {
  it('opens on the meetings without slogans', async () => {
    render(<App api={apiFor()} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mes réunions' }),
    ).toBeInTheDocument();
    for (const text of [
      'Moins de notes. Plus de présence.',
      'Les conversations passent. Les bonnes idées restent.',
      'Gardez toute la conversation.',
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });
  it('opens the settings without slogans', async () => {
    const user = userEvent.setup();
    render(<App api={apiFor()} />);
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Paramètres' }),
    ).toBeInTheDocument();
    for (const text of ['À votre façon', 'Vos données chez vous. Votre IA à portée de main.']) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });
  it('keeps a drag band on the startup screen', () => {
    const api = apiFor();
    api.getSettings = () => new Promise(() => {});
    render(<App api={api} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ouverture de SayBack');
    expect(document.querySelector('.startup-screen > .window-band')).not.toBeNull();
  });
});
