// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeetingContent } from './MeetingContent';
import { useDetailView, type TranscriptView } from './use-detail-view';

const playAt = vi.fn();
const scrolled = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled(this);
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Probe({ view }: { view: TranscriptView }) {
  return (
    <div>
      <p>{view.following ? 'Suit la lecture' : 'Lecture libre'}</p>
      <p>{view.passage ? `Passage ${view.passage.sourceId}` : 'Aucun passage'}</p>
      <article aria-current="time">Le budget.</article>
      <button type="button" onClick={view.onBackToNotes}>
        Retour aux notes
      </button>
      <button type="button" onClick={() => view.onSeek(30)}>
        Lire à partir de 0:30
      </button>
    </div>
  );
}

function Harness() {
  const view = useDetailView(playAt);
  return (
    <MeetingContent
      header={<h1>Revue</h1>}
      view={view}
      notes={
        <button type="button" onClick={() => view.openPassage(61, '1-0')}>
          Écouter à 1:01
        </button>
      }
      transcript={<Probe view={view.transcript} />}
    />
  );
}

const scroller = () => {
  const element = document.querySelector<HTMLElement>('.detail-scroll');
  if (!element) throw new Error('no scroll container');
  return element;
};
const selected = (name: string) => screen.getByRole('tab', { name }).getAttribute('aria-selected');

it('opens the passage of a note: plays it, shows the transcript, places the turn', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Écouter à 1:01' }));
  expect(playAt).toHaveBeenCalledWith(61);
  expect(selected('Transcription')).toBe('true');
  expect(screen.getByText('Passage 1-0')).toBeInTheDocument();
  expect(scrolled).toHaveBeenLastCalledWith(screen.getByText('Le budget.'));
});

it('goes back to the notes where they were, and forgets the passage', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  scroller().scrollTop = 300;
  await user.click(screen.getByRole('button', { name: 'Écouter à 1:01' }));
  await user.click(screen.getByRole('button', { name: 'Retour aux notes' }));
  expect(selected('Notes')).toBe('true');
  expect(scroller().scrollTop).toBe(300);
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(screen.getByText('Aucun passage')).toBeInTheDocument();
});

it('leaves the place alone when the reader stopped following, until a time is clicked', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  fireEvent.wheel(scroller());
  expect(screen.getByText('Lecture libre')).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Notes' }));
  scrolled.mockClear();
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(scrolled).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Lire à partir de 0:30' }));
  expect(playAt).toHaveBeenCalledWith(30);
  expect(screen.getByText('Suit la lecture')).toBeInTheDocument();
});

it('counts gestures only while the transcript shows', async () => {
  render(<Harness />);
  fireEvent.wheel(scroller());
  await userEvent.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(screen.getByText('Suit la lecture')).toBeInTheDocument();
});
