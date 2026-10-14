// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AudioChunk, Meeting, Notes } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { groupByDate } from './date-groups';
import { MeetingList } from './MeetingList';
import { MEETING_DRAG_TYPE } from './useFolderDrop';

afterEach(cleanup);

const now = new Date(2026, 9, 14, 10, 0);
const local = (month: number, day: number, hour = 12, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute).toISOString();
const notes = (summary: string): Notes => ({
  summary,
  keyPoints: [],
  decisions: [],
  actions: [],
  questions: [],
});
const chunk = (index: number, transcribed: boolean): AudioChunk => ({
  index,
  start: index * 600,
  duration: 600,
  transcript: transcribed ? [] : null,
});
const meetings: Meeting[] = [
  meetingFixture('a', 'Revue produit', local(10, 14, 8, 30), {
    status: 'ready',
    folderId: 'f1',
    notes: notes('Budget validé pour le trimestre.'),
  }),
  meetingFixture('b', 'Point hebdo', local(10, 13, 9)),
  meetingFixture('c', 'Rétro sprint', local(10, 12, 9), {
    status: 'processing',
    audioChunks: [chunk(0, true), chunk(1, false)],
  }),
  meetingFixture('d', 'Démo client', local(9, 30), { status: 'error' }),
  meetingFixture('e', 'Appel en cours', local(10, 14, 9, 45), { status: 'recording' }),
];

function renderList(overrides: Partial<ComponentProps<typeof MeetingList>> = {}) {
  const props: ComponentProps<typeof MeetingList> = {
    groups: groupByDate(meetings, now),
    folders: [{ id: 'f1', name: 'Acme', createdAt: '' }],
    selectedId: null,
    now,
    locked: false,
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<MeetingList {...props} />);
  return props.onSelect;
}

const row = (title: RegExp) => screen.getByRole('option', { name: title });

it('groups meetings under date headings, newest first', () => {
  renderList();
  const today = within(screen.getByRole('group', { name: 'Aujourd’hui' }));
  expect(today.getAllByRole('option').map((option) => option.dataset.meetingId)).toEqual([
    'e',
    'a',
  ]);
  expect(within(screen.getByRole('group', { name: 'Hier' })).getByRole('option')).toHaveTextContent(
    'Point hebdo',
  );
  expect(screen.getByRole('group', { name: 'Septembre 2026' })).toBeInTheDocument();
});

it('shows the time, the summary of a ready meeting and its folder, and nothing else', () => {
  renderList();
  const ready = row(/Revue produit/);
  expect(ready).toHaveTextContent('08:30');
  expect(ready).toHaveTextContent('Budget validé pour le trimestre.');
  expect(ready).toHaveTextContent('Acme');
  expect(row(/Point hebdo/)).not.toHaveTextContent('Acme');
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(document.querySelector('[role="option"] svg')).toBeNull();
});

it('replaces the summary with the status until the notes are ready', () => {
  renderList();
  expect(row(/Point hebdo/)).toHaveTextContent('À analyser');
  expect(row(/Rétro sprint/)).toHaveTextContent('Analyse en cours');
  expect(row(/Rétro sprint/).querySelector('.row-progress-bar')).toHaveStyle({
    transform: 'scaleX(0.5)',
  });
  expect(row(/Démo client/)).toHaveTextContent('À reprendre');
  expect(row(/Appel en cours/)).toHaveTextContent('Enregistrement');
  expect(row(/Revue produit/)).not.toHaveTextContent('Notes prêtes');
});

it('selects with a click and marks the selection', () => {
  const onSelect = renderList({ selectedId: 'b' });
  expect(row(/Point hebdo/)).toHaveAttribute('aria-selected', 'true');
  expect(row(/Point hebdo/)).toHaveAttribute('tabindex', '0');
  expect(row(/Revue produit/)).toHaveAttribute('tabindex', '-1');
  fireEvent.click(row(/Démo client/));
  expect(onSelect).toHaveBeenCalledWith('d');
});

it('moves the selection with the arrow keys across groups, and the focus follows', () => {
  const onSelect = renderList({ selectedId: 'a' });
  fireEvent.keyDown(screen.getByRole('listbox', { name: 'Réunions' }), { key: 'ArrowDown' });
  expect(onSelect).toHaveBeenCalledWith('b');
  expect(row(/Point hebdo/)).toHaveFocus();
});

it('stops at both ends of the list', () => {
  const onSelect = renderList({ selectedId: 'e' });
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowUp' });
  cleanup();
  const onSelectLast = renderList({ selectedId: 'd' });
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
  expect(onSelect).not.toHaveBeenCalled();
  expect(onSelectLast).not.toHaveBeenCalled();
});

it('starts from the top when the selection is filtered out', () => {
  const onSelect = renderList({ selectedId: 'hidden' });
  expect(row(/Appel en cours/)).toHaveAttribute('tabindex', '0');
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
  expect(onSelect).toHaveBeenCalledWith('e');
});

it('stays still while a recording locks the list', () => {
  const onSelect = renderList({ selectedId: 'a', locked: true });
  fireEvent.click(row(/Point hebdo/));
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
  expect(onSelect).not.toHaveBeenCalled();
  expect(row(/Point hebdo/)).toHaveAttribute('aria-disabled', 'true');
  expect(row(/Point hebdo/)).toHaveAttribute('draggable', 'false');
});

it('lets only settled meetings be dragged', () => {
  renderList();
  expect(row(/Revue produit/)).toHaveAttribute('draggable', 'true');
  expect(row(/Rétro sprint/)).toHaveAttribute('draggable', 'false');
  expect(row(/Appel en cours/)).toHaveAttribute('draggable', 'false');
});

it('marks the row being dragged and clears it when the drag ends', () => {
  renderList();
  const dragged = row(/Revue produit/);
  const dataTransfer = { types: [MEETING_DRAG_TYPE], setData: vi.fn(), effectAllowed: 'none' };
  fireEvent.dragStart(dragged, { dataTransfer });
  expect(dataTransfer.setData).toHaveBeenCalledWith(MEETING_DRAG_TYPE, 'a');
  expect(dragged).toHaveClass('is-dragging');
  fireEvent.dragEnd(dragged);
  expect(dragged).not.toHaveClass('is-dragging');
});

it.each([
  ['Enter', 'Enter', 'd'],
  ['Space', ' ', 'd'],
])('opens the focused row with %s', (_name, key, expected) => {
  const onSelect = renderList({ selectedId: 'a' });
  const target = row(/Démo client/);
  target.focus();
  const passedOn = fireEvent.keyDown(target, { key });
  expect(onSelect).toHaveBeenCalledWith(expected);
  expect(passedOn).toBe(false);
});

it('goes to the first and the last row with Home and End', () => {
  const onSelect = renderList({ selectedId: 'b' });
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'End' });
  expect(onSelect).toHaveBeenLastCalledWith('d');
  expect(row(/Démo client/)).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Home' });
  expect(onSelect).toHaveBeenLastCalledWith('e');
});

it.each([
  ['Alt', { altKey: true }],
  ['Ctrl', { ctrlKey: true }],
  ['Cmd', { metaKey: true }],
  ['Shift', { shiftKey: true }],
])('leaves %s combinations to the browser', (_name, modifier) => {
  const onSelect = renderList({ selectedId: 'a' });
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ']) {
    const passedOn = fireEvent.keyDown(row(/Point hebdo/), { key, ...modifier });
    expect(passedOn).toBe(true);
  }
  expect(onSelect).not.toHaveBeenCalled();
});

it('ignores Enter while a recording locks the list', () => {
  const onSelect = renderList({ selectedId: 'a', locked: true });
  fireEvent.keyDown(row(/Point hebdo/), { key: 'Enter' });
  expect(onSelect).not.toHaveBeenCalled();
});
