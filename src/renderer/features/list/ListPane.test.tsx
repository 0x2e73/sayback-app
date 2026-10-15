// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Folder, Meeting, Notes } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { ListPane, type ListPaneProps } from './ListPane';
import { useListFilter } from './use-list-filter';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const acme: Folder = { id: 'folder', name: 'Acme', createdAt: '' };
const projet: Folder = { id: 'projet', name: 'Projet', createdAt: '' };
const notes = (summary: string): Notes => ({
  summary,
  keyPoints: [],
  decisions: [],
  actions: [],
  questions: [],
});
const today = (id: string, title: string, extra: Partial<Meeting> = {}) =>
  meetingFixture(id, title, new Date().toISOString(), extra);

type PaneProps = Omit<ListPaneProps, 'scope' | 'query' | 'visibleMeetings' | 'onScope' | 'onQuery'>;

// The workspace owns the filter in the app: the harness plays that part.
function Pane(pane: PaneProps) {
  const filter = useListFilter(pane.meetings, pane.folders);
  return (
    <ListPane
      {...pane}
      scope={filter.scope}
      query={filter.query}
      visibleMeetings={filter.visible}
      onScope={filter.setScope}
      onQuery={filter.setQuery}
    />
  );
}

function props(overrides: Partial<PaneProps> = {}): PaneProps {
  return {
    meetings: [],
    folders: [],
    folderActions: {
      create: vi.fn(async () => null),
      rename: vi.fn(async () => true),
      remove: vi.fn(async () => true),
      move: vi.fn(async () => true),
    },
    loading: false,
    selectedId: null,
    settingsOpen: false,
    recording: null,
    update: { status: null, busy: false, onInstall: vi.fn() },
    onSelect: vi.fn(),
    onRowMenu: vi.fn(),
    onToggleSettings: vi.fn(),
    onNew: vi.fn(),
    onShowRecording: vi.fn(),
    ...overrides,
  };
}

const search = () => screen.getByRole('searchbox', { name: 'Rechercher une réunion' });

it('searches inside the selected folder and offers to search everywhere', async () => {
  const user = userEvent.setup();
  const meetings = [today('a', 'Produit', { folderId: 'projet' }), today('b', 'Équipe')];
  render(<Pane {...props({ meetings, folders: [projet] })} />);
  await user.click(screen.getByRole('button', { name: 'Projet' }));
  expect(screen.getByRole('option', { name: /Produit/ })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Équipe/ })).toBeNull();
  await user.type(search(), 'Équipe');
  expect(screen.getByText('Aucune réunion pour « Équipe »')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Chercher dans toutes les réunions' }));
  expect(screen.getByRole('option', { name: /Équipe/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');
  expect(search()).toHaveValue('Équipe');
});

it('finds a meeting by its summary, without accents or case', async () => {
  const user = userEvent.setup();
  const meetings = [
    today('a', 'Revue', { status: 'ready', notes: notes('Budget validé') }),
    today('b', 'Point hebdo'),
  ];
  render(<Pane {...props({ meetings })} />);
  await user.type(search(), 'BUDGET VALIDE');
  expect(screen.getAllByRole('option').map((option) => option.dataset.meetingId)).toEqual(['a']);
});

it('says when a folder is empty', async () => {
  const user = userEvent.setup();
  render(<Pane {...props({ meetings: [today('a', 'Produit')], folders: [acme] })} />);
  await user.click(screen.getByRole('button', { name: 'Acme' }));
  expect(screen.getByText('Aucune réunion dans « Acme »')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Chercher dans toutes les réunions' })).toBeNull();
});

it('shows five still skeleton rows while loading', () => {
  const view = render(<Pane {...props({ loading: true })} />);
  expect(screen.getByText('Chargement des réunions…')).toBeInTheDocument();
  expect(view.container.querySelectorAll('.skeleton-row')).toHaveLength(5);
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('says when there is no meeting at all', () => {
  render(<Pane {...props()} />);
  expect(screen.getByText('Aucune réunion')).toBeInTheDocument();
});

it('returns to every meeting when the filtered folder is deleted', async () => {
  const user = userEvent.setup();
  const meetings = [today('a', 'Produit', { folderId: 'folder' }), today('b', 'Équipe')];
  const view = render(<Pane {...props({ meetings, folders: [acme] })} />);
  await user.click(screen.getByRole('button', { name: 'Acme' }));
  expect(screen.getAllByRole('option')).toHaveLength(1);
  view.rerender(<Pane {...props({ meetings, folders: [] })} />);
  expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getAllByRole('option')).toHaveLength(2);
});

it("moves today's meetings to yesterday at midnight without a reload", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 14, 23, 59, 30));
  const late = meetingFixture('a', 'Point tardif', new Date(2026, 9, 14, 23, 0).toISOString());
  render(<Pane {...props({ meetings: [late] })} />);
  expect(screen.getByRole('group', { name: 'Aujourd’hui' })).toHaveTextContent('23:00');
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.queryByRole('group', { name: 'Aujourd’hui' })).toBeNull();
  expect(screen.getByRole('group', { name: 'Hier' })).toHaveTextContent('Point tardif');
  expect(screen.getByRole('option', { name: /Point tardif/ })).toHaveTextContent('Hier');
});

it('focuses the search with the find shortcut', () => {
  render(<Pane {...props({ meetings: [today('a', 'Produit')] })} />);
  fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
  expect(search()).toHaveFocus();
});

it('locks the search, the folders and the rows during a recording', () => {
  const meetings = [today('a', 'Produit')];
  render(<Pane {...props({ meetings, recording: { elapsed: 0 } })} />);
  const pane = screen.getByRole('complementary', { name: 'Liste des réunions' });
  expect(search()).toBeDisabled();
  expect(within(pane).getByRole('button', { name: 'Tous' })).toBeDisabled();
  expect(screen.getByRole('option', { name: /Produit/ })).toHaveAttribute('aria-disabled', 'true');
  expect(within(pane).getByRole('button', { name: 'Paramètres' })).toBeDisabled();
});

it('marks every folder chip as a drop target from pick-up to drop, and moves on drop', () => {
  const move = vi.fn(async () => true);
  const folderActions = { ...props().folderActions, move };
  const meetings = [today('a', 'Produit')];
  render(<Pane {...props({ meetings, folders: [acme, projet], folderActions })} />);
  const chips = ['Acme', 'Projet', 'Sans dossier'].map((name) =>
    screen.getByRole('button', { name }),
  );
  const transfer = {
    types: ['application/x-sayback-meeting'],
    getData: () => 'a',
    setData: vi.fn(),
  };
  chips.forEach((chip) => expect(chip).not.toHaveAttribute('data-drop-ready'));
  fireEvent.dragStart(screen.getByRole('option', { name: /Produit/ }), { dataTransfer: transfer });
  chips.forEach((chip) => expect(chip).toHaveAttribute('data-drop-ready'));
  fireEvent.dragOver(chips[1]!, { dataTransfer: transfer });
  expect(chips[1]).toHaveAttribute('data-drag-over', 'true');
  expect(chips[0]).toHaveAttribute('data-drag-over', 'false');
  fireEvent.drop(chips[1]!, { dataTransfer: transfer });
  expect(move).toHaveBeenCalledWith('a', 'projet');
  chips.forEach((chip) => expect(chip).not.toHaveAttribute('data-drop-ready'));
});

it('stops marking the chips when a drag is let go without a drop', () => {
  render(<Pane {...props({ meetings: [today('a', 'Produit')], folders: [acme] })} />);
  const row = screen.getByRole('option', { name: /Produit/ });
  fireEvent.dragStart(row, { dataTransfer: { setData: vi.fn() } });
  expect(screen.getByRole('button', { name: 'Acme' })).toHaveAttribute('data-drop-ready');
  fireEvent.dragEnd(row);
  expect(screen.getByRole('button', { name: 'Acme' })).not.toHaveAttribute('data-drop-ready');
});

it('opens no row menu while a recording locks the list', () => {
  const onRowMenu = vi.fn();
  const meetings = [today('a', 'Produit')];
  render(<Pane {...props({ meetings, onRowMenu, recording: { elapsed: 5 } })} />);
  const row = screen.getByRole('option', { name: /Produit/ });
  fireEvent.contextMenu(row);
  fireEvent.keyDown(row, { key: 'ContextMenu' });
  expect(onRowMenu).not.toHaveBeenCalled();
});

it('drops the marks of a drag whose row left the library before the drag ended', () => {
  const folders = [acme];
  const view = render(<Pane {...props({ meetings: [today('a', 'Produit')], folders })} />);
  fireEvent.dragStart(screen.getByRole('option', { name: /Produit/ }), {
    dataTransfer: { setData: vi.fn() },
  });
  expect(screen.getByRole('button', { name: 'Acme' })).toHaveAttribute('data-drop-ready');
  view.rerender(<Pane {...props({ meetings: [], folders })} />);
  expect(screen.getByRole('button', { name: 'Acme' })).not.toHaveAttribute('data-drop-ready');
});

it('ends a drag on a dragend that only reaches the window', () => {
  render(<Pane {...props({ meetings: [today('a', 'Produit')], folders: [acme] })} />);
  const row = screen.getByRole('option', { name: /Produit/ });
  fireEvent.dragStart(row, { dataTransfer: { setData: vi.fn() } });
  expect(row).toHaveClass('is-dragging');
  fireEvent.dragEnd(window);
  expect(row).not.toHaveClass('is-dragging');
  expect(screen.getByRole('button', { name: 'Acme' })).not.toHaveAttribute('data-drop-ready');
});
