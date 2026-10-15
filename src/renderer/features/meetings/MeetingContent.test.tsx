// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MeetingContent } from './MeetingContent';
import { useDetailView, type TranscriptView } from './use-detail-view';

afterEach(cleanup);

const playAt = vi.fn();

function Harness(props: { notes: ReactNode; transcript?: (view: TranscriptView) => ReactNode }) {
  const view = useDetailView(playAt);
  return (
    <MeetingContent
      header={<h1>Revue</h1>}
      view={view}
      notes={props.notes}
      transcript={props.transcript?.(view.transcript) ?? <p>Rien à lire.</p>}
    />
  );
}

function searchField({ search, onSearch }: TranscriptView) {
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
  render(<Harness notes={<p>Notes</p>} transcript={searchField} />);
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  await user.type(screen.getByRole('textbox', { name: 'Chercher' }), 'budget');
  await user.click(screen.getByRole('tab', { name: 'Notes' }));
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(screen.getByRole('textbox', { name: 'Chercher' })).toHaveValue('budget');
});

it('makes a panel without any control reachable by keyboard', () => {
  render(<Harness notes={<p>Rien à faire ici.</p>} />);
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).toHaveAttribute('tabindex', '0');
});

it('leaves a panel that holds controls out of the tab order', () => {
  render(<Harness notes={<button type="button">Ajouter une précision</button>} />);
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).not.toHaveAttribute('tabindex');
});

it('ignores a disabled control when looking for something to focus', () => {
  render(
    <Harness
      notes={
        <button type="button" disabled>
          Ajouter une précision
        </button>
      }
    />,
  );
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).toHaveAttribute('tabindex', '0');
});

it('makes the panel arrive from the side the indicator went to', async () => {
  const user = userEvent.setup();
  render(<Harness notes={<p>Notes</p>} />);
  expect(document.querySelector('.detail-panel')).not.toHaveAttribute('data-direction');
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(screen.getByRole('tabpanel', { name: 'Transcription' })).toHaveAttribute(
    'data-direction',
    'forward',
  );
  await user.click(screen.getByRole('tab', { name: 'Notes' }));
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).toHaveAttribute('data-direction', 'back');
});
