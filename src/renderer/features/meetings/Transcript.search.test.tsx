// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Segment } from '../../../shared/contracts';
import { meetingWith, recordScrolls, TranscriptHarness } from './transcript-harness';

let scrolled: ReturnType<typeof recordScrolls>;

beforeEach(() => {
  scrolled = recordScrolls();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const segment = (id: string, start: number, text: string, speaker = 'A'): Segment => ({
  id,
  start,
  end: start + 2,
  text,
  speaker,
});
const meeting = meetingWith([
  segment('0-0', 1, 'Bonjour.'),
  segment('0-1', 4, 'Salut, le budget.', 'B'),
  segment('0-2', 7, 'Le Café de l’Équipe et le budget.'),
  segment('0-3', 10, 'Budget validé.', 'B'),
]);
const field = () => screen.getByRole('searchbox', { name: 'Chercher dans la transcription' });
const marks = () => [...document.querySelectorAll('mark')];
const currentMark = () => document.querySelector('mark[aria-current="true"]');

it('keeps every passage and highlights the matches', async () => {
  render(<TranscriptHarness meeting={meeting} />);
  await userEvent.type(field(), 'salut');
  expect(screen.getByText('Bonjour.')).toBeVisible();
  expect(marks().map((mark) => mark.textContent)).toEqual(['Salut']);
  expect(screen.getByText('1 sur 1')).toBeInTheDocument();
});

it('ignores case and accents and highlights the text as written', async () => {
  render(<TranscriptHarness meeting={meeting} />);
  await userEvent.type(field(), "l'equipe");
  expect(marks().map((mark) => mark.textContent)).toEqual(['l’Équipe']);
});

it('says « Aucun résultat » when nothing matches', async () => {
  render(<TranscriptHarness meeting={meeting} />);
  await userEvent.type(field(), 'absent');
  expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Résultat suivant' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Résultat précédent' })).toBeDisabled();
});

it('goes through the matches with Enter, Shift+Enter and the arrows', async () => {
  const user = userEvent.setup();
  render(<TranscriptHarness meeting={meeting} />);
  await user.type(field(), 'budget');
  expect(screen.getByText('1 sur 3')).toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(screen.getByText('2 sur 3')).toBeInTheDocument();
  expect(currentMark()?.closest('p')).toHaveTextContent('Le Café de l’Équipe et le budget.');
  await user.keyboard('{Enter}{Enter}');
  expect(screen.getByText('1 sur 3')).toBeInTheDocument();
  await user.keyboard('{Shift>}{Enter}{/Shift}');
  expect(screen.getByText('3 sur 3')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Résultat précédent' }));
  expect(screen.getByText('2 sur 3')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Résultat suivant' }));
  expect(screen.getByText('3 sur 3')).toBeInTheDocument();
});

it('scrolls the current match into view', async () => {
  const user = userEvent.setup();
  render(<TranscriptHarness meeting={meeting} />);
  await user.type(field(), 'budget');
  await user.keyboard('{Enter}');
  expect(scrolled).toHaveBeenLastCalledWith(currentMark(), { block: 'nearest' });
});

it('clears the search with Escape and gives the focus back', async () => {
  const user = userEvent.setup();
  render(<TranscriptHarness meeting={meeting} />);
  const time = screen.getByRole('button', { name: 'Lire à partir de 0:01' });
  time.focus();
  await user.click(field());
  await user.keyboard('budget{Escape}');
  expect(field()).toHaveValue('');
  expect(marks()).toEqual([]);
  expect(time).toHaveFocus();
});

it('counts at most 500 matches', async () => {
  render(<TranscriptHarness meeting={meetingWith([segment('0-0', 1, 'a '.repeat(600))])} />);
  await userEvent.type(field(), 'a');
  expect(screen.getByText('1 sur 500+')).toBeInTheDocument();
  expect(marks()).toHaveLength(500);
});

it('keeps the current match when a poll brings text before and after it', async () => {
  const user = userEvent.setup();
  const later = [
    segment('1-0', 601, 'Le budget trois.'),
    segment('1-1', 604, 'Le budget quatre.', 'B'),
  ];
  const { rerender } = render(<TranscriptHarness meeting={meetingWith(later)} />);
  await user.type(field(), 'budget');
  expect(screen.getByText('1 sur 2')).toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(currentMark()?.closest('p')).toHaveTextContent('Le budget quatre.');
  rerender(
    <TranscriptHarness meeting={meetingWith([segment('0-0', 1, 'Le budget un.'), ...later])} />,
  );
  expect(screen.getByText('3 sur 3')).toBeInTheDocument();
  expect(currentMark()?.closest('p')).toHaveTextContent('Le budget quatre.');
  rerender(
    <TranscriptHarness
      meeting={meetingWith([
        segment('0-0', 1, 'Le budget un.'),
        ...later,
        segment('2-0', 1201, 'Le budget cinq.'),
      ])}
    />,
  );
  expect(screen.getByText('3 sur 4')).toBeInTheDocument();
  expect(currentMark()?.closest('p')).toHaveTextContent('Le budget quatre.');
});

it('keeps the first match current when the reader did not move and text arrives before it', async () => {
  const later = [segment('1-0', 601, 'Le budget trois.')];
  const { rerender } = render(<TranscriptHarness meeting={meetingWith(later)} />);
  await userEvent.type(field(), 'budget');
  rerender(
    <TranscriptHarness meeting={meetingWith([segment('0-0', 1, 'Le budget un.'), ...later])} />,
  );
  expect(screen.getByText('2 sur 2')).toBeInTheDocument();
  expect(currentMark()?.closest('p')).toHaveTextContent('Le budget trois.');
});
