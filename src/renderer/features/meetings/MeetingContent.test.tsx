// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MeetingContent } from './MeetingContent';
import type { TranscriptSearch } from './Transcript';

afterEach(cleanup);

function renderContent(notes: ReactNode, transcript?: (search: TranscriptSearch) => ReactNode) {
  render(
    <MeetingContent
      header={<h1>Revue</h1>}
      notes={notes}
      transcript={transcript ?? (() => <p>Rien à lire.</p>)}
    />,
  );
}

function searchField({ search, onSearch }: TranscriptSearch) {
  return (
    <input
      aria-label="Chercher"
      value={search}
      onChange={(event) => onSearch(event.target.value)}
    />
  );
}

it('keeps the transcript search when the tab changes and comes back', async () => {
  const user = userEvent.setup();
  renderContent(<p>Notes</p>, searchField);
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  await user.type(screen.getByRole('textbox', { name: 'Chercher' }), 'budget');
  await user.click(screen.getByRole('tab', { name: 'Notes' }));
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(screen.getByRole('textbox', { name: 'Chercher' })).toHaveValue('budget');
});

it('makes a panel without any control reachable by keyboard', () => {
  renderContent(<p>Rien à faire ici.</p>);
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).toHaveAttribute('tabindex', '0');
});

it('leaves a panel that holds controls out of the tab order', () => {
  renderContent(<button type="button">Ajouter une précision</button>);
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).not.toHaveAttribute('tabindex');
});

it('ignores a disabled control when looking for something to focus', () => {
  renderContent(
    <button type="button" disabled>
      Ajouter une précision
    </button>,
  );
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).toHaveAttribute('tabindex', '0');
});
