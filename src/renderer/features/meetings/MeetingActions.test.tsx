// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { meetingFixture } from '../../test-api';
import { downloadMeeting } from './download-meeting';
import { MeetingActions } from './MeetingActions';
import { notesMarkdown } from './meeting-format';

vi.mock('./download-meeting', () => ({ downloadMeeting: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const analysed = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
  status: 'ready',
  transcript: [{ id: '0-0', start: 4, end: 6, text: 'Bonjour.', speaker: 'A' }],
  notes: {
    summary: 'On valide le budget.',
    keyPoints: [],
    decisions: [],
    actions: [],
    questions: [],
  },
});

it('names every action and gives it a tooltip', () => {
  render(<MeetingActions meeting={analysed} busy={false} onDelete={vi.fn()} />);
  const pill = screen.getByRole('group', { name: 'Actions de la réunion' });
  for (const name of ['Copier les notes', 'Exporter', 'Supprimer la réunion']) {
    expect(within(pill).getByRole('button', { name })).toHaveAttribute('title', name);
  }
});

it('copies the notes, not the transcript', async () => {
  const user = userEvent.setup();
  render(<MeetingActions meeting={analysed} busy={false} onDelete={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Copier les notes' }));
  const copied = await navigator.clipboard.readText();
  expect(copied).toBe(notesMarkdown(analysed));
  expect(copied).not.toContain('## Transcription');
  expect(await screen.findByText('Notes copiées.')).toBeInTheDocument();
});

it('says when the copy fails', async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('refusé'));
  render(<MeetingActions meeting={analysed} busy={false} onDelete={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Copier les notes' }));
  expect(await screen.findByText('La copie a échoué. Réessayez.')).toBeInTheDocument();
});

it('exports the whole meeting', async () => {
  const user = userEvent.setup();
  render(<MeetingActions meeting={analysed} busy={false} onDelete={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Exporter' }));
  expect(downloadMeeting).toHaveBeenCalledWith(analysed);
});

it('asks before deleting, and not during an analysis', async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn();
  const { rerender } = render(
    <MeetingActions meeting={analysed} busy={false} onDelete={onDelete} />,
  );
  await user.click(screen.getByRole('button', { name: 'Supprimer la réunion' }));
  expect(onDelete).toHaveBeenCalledOnce();
  rerender(<MeetingActions meeting={analysed} busy onDelete={onDelete} />);
  expect(screen.getByRole('button', { name: 'Supprimer la réunion' })).toBeDisabled();
});

it('has nothing to copy or export before the analysis', () => {
  render(
    <MeetingActions
      meeting={meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z')}
      busy={false}
      onDelete={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Copier les notes' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled();
});

it('lets a failed copy fade away like a successful one', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('refusé'));
    render(<MeetingActions meeting={analysed} busy={false} onDelete={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Copier les notes' }));
    expect(await screen.findByText('La copie a échoué. Réessayez.')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(screen.queryByText('La copie a échoué. Réessayez.')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('holds the copy and the export back during an analysis, and says why', () => {
  render(<MeetingActions meeting={analysed} busy onDelete={vi.fn()} />);
  for (const name of ['Copier les notes', 'Exporter']) {
    const button = screen.getByRole('button', { name });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Disponible à la fin de l’analyse.');
  }
});

it('says what is missing when there is nothing to copy or export yet', () => {
  render(
    <MeetingActions
      meeting={meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z')}
      busy={false}
      onDelete={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Copier les notes' })).toHaveAttribute(
    'title',
    'Aucune note à copier pour le moment.',
  );
  expect(screen.getByRole('button', { name: 'Exporter' })).toHaveAttribute(
    'title',
    'Aucune transcription à exporter pour le moment.',
  );
});
