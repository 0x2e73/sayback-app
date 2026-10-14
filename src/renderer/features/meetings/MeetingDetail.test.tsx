// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFor, meetingFixture } from '../../test-api';
import { MeetingDetail } from './MeetingDetail';

afterEach(cleanup);

const meeting = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z');

function renderDetail(onDeleted = vi.fn()) {
  render(
    <MeetingDetail
      meeting={meeting}
      api={apiFor([meeting])}
      folders={[]}
      onUpdate={vi.fn()}
      onMove={vi.fn(async () => true)}
      onDeleted={onDeleted}
      onSettings={vi.fn()}
    />,
  );
  return onDeleted;
}

it('opens without a way back: the list is the navigation', () => {
  renderDetail();
  expect(screen.getByRole('heading', { level: 1, name: 'Revue produit' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Toutes les réunions' })).toBeNull();
});

it('hands the deletion over once the meeting is gone', async () => {
  const user = userEvent.setup();
  const onDeleted = renderDetail();
  await user.click(screen.getByRole('button', { name: 'Supprimer la réunion' }));
  await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
  expect(onDeleted).toHaveBeenCalledOnce();
});
