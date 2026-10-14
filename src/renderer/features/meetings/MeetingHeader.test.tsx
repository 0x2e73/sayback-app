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

function renderHeader(meeting: Meeting) {
  const onMove = vi.fn();
  render(
    <MeetingHeader
      meeting={meeting}
      folders={folders}
      busy={false}
      onMove={onMove}
      onExport={vi.fn()}
      onDelete={vi.fn()}
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
