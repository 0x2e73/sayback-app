// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { MeetingHeader } from './MeetingHeader';

afterEach(cleanup);

const folders = [
  { id: 'f1', name: 'Acme', createdAt: '' },
  { id: 'f2', name: 'Interne', createdAt: '' },
];

function renderHeader(meeting: Meeting, analyzing = false) {
  const onMove = vi.fn();
  render(
    <MeetingHeader
      meeting={meeting}
      folders={folders}
      analyzing={analyzing}
      onMove={onMove}
      onCreateFolder={vi.fn(async () => null)}
    />,
  );
  return { onMove, select: screen.getByRole('combobox', { name: 'Dossier de la réunion' }) };
}

it('files the meeting from the header', async () => {
  const user = userEvent.setup();
  const { onMove, select } = renderHeader(meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z'));
  expect(select).toHaveDisplayValue('Sans dossier');
  await user.selectOptions(select, 'Acme');
  expect(onMove).toHaveBeenLastCalledWith('f1');
});

it('takes the meeting out of its folder', async () => {
  const user = userEvent.setup();
  const meeting = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', { folderId: 'f1' });
  const { onMove, select } = renderHeader(meeting);
  expect(select).toHaveDisplayValue('Acme');
  await user.selectOptions(select, 'Sans dossier');
  expect(onMove).toHaveBeenLastCalledWith(null);
});

it.each(['processing', 'recording'] as const)('keeps the folder while %s', (status) => {
  const { select } = renderHeader(
    meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', { status }),
  );
  expect(select).toBeDisabled();
});

it('opens a meeting whose date is unreadable', () => {
  renderHeader(meetingFixture('m1', 'Revue', 'nope'));
  expect(screen.getByRole('heading', { level: 1, name: 'Revue' })).toBeInTheDocument();
  expect(screen.getByText('Date inconnue')).toBeInTheDocument();
});

it('reads in one line: folder, date, duration and status', () => {
  renderHeader(meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', { duration: 3130 }));
  expect(screen.getByText('Ajouter à un dossier…')).toBeInTheDocument();
  expect(screen.getByText('14 oct. 2026')).toBeInTheDocument();
  expect(screen.getByText('52 min')).toBeInTheDocument();
  expect(screen.getByText('À analyser')).toBeInTheDocument();
});

it('shows the analysis progress in place of the status', () => {
  const meeting = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', {
    status: 'processing',
    audioChunks: Array.from({ length: 12 }, (_, index) => ({
      index,
      start: index * 60,
      duration: 60,
      transcript: index < 3 ? [] : null,
    })),
  });
  renderHeader(meeting, true);
  expect(screen.getByRole('status')).toHaveTextContent('Analyse en cours · 3 segments sur 12');
  expect(screen.queryByText('Analyse en cours')).toBeNull();
});

it('has no summary sentence under the title', () => {
  renderHeader(
    meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', {
      status: 'ready',
      notes: {
        summary: 'On valide le budget.',
        keyPoints: [],
        decisions: [],
        actions: [],
        questions: [],
      },
    }),
  );
  expect(screen.queryByText('On valide le budget.')).toBeNull();
});

it('puts the status badge in its own slot so the separator never lands inside the pill', () => {
  renderHeader(meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z'));
  const badge = screen.getByText('À analyser');
  expect(badge).toHaveClass('badge');
  expect(badge.parentElement).toHaveClass('detail-meta-item');
  expect(badge.parentElement?.parentElement).toHaveClass('detail-meta');
});
