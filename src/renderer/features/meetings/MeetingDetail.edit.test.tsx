// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { apiFor, meetingFixture, ok } from '../../test-api';
import { MeetingDetail } from './MeetingDetail';

afterEach(cleanup);

function setup() {
  const meeting = meetingFixture('m1', 'Réunion', '2026-10-14T08:00:00Z', {
    status: 'ready',
    transcript: [{ id: '0-0', start: 0, end: 1, text: 'Bonjour.' }],
  });
  const api = apiFor([meeting]);
  const onUpdate = vi.fn();
  api.renameMeeting = vi.fn((_id: string, title: string) => ok({ ...meeting, title }));
  api.exportMeeting = vi.fn(() => ok(true));
  render(
    <MeetingDetail
      meeting={meeting}
      api={api}
      folders={[]}
      onUpdate={onUpdate}
      onMove={async () => true}
      onCreateFolder={async () => null}
      onDeleted={vi.fn()}
      onSettings={vi.fn()}
    />,
  );
  return { api, onUpdate, user: userEvent.setup() };
}

it('renames a meeting and keeps the form open with its input after a failure', async () => {
  const { api, onUpdate, user } = setup();
  await user.click(screen.getByRole('button', { name: 'Renommer la réunion' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Renommer la réunion' }));
  expect(dialog.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  const input = dialog.getByRole('textbox', { name: 'Titre de la réunion' });
  await user.clear(input);
  await user.type(input, '  Nouveau nom  ');
  vi.mocked(api.renameMeeting).mockResolvedValueOnce({ ok: false, error: 'Écriture impossible.' });
  await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('Écriture impossible.');
  expect(input).toHaveValue('  Nouveau nom  ');
  await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
  expect(api.renameMeeting).toHaveBeenLastCalledWith('m1', 'Nouveau nom');
  expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nouveau nom' }));
});

it('offers explicit export choices, keeps cancellation quiet and lets failures retry', async () => {
  const { api, user } = setup();
  await user.click(screen.getByRole('button', { name: 'Exporter' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Exporter la réunion' }));
  await user.click(dialog.getByRole('radio', { name: /Transcription seule/ }));
  expect(dialog.getByRole('radio', { name: /Notes seules/ })).toBeDisabled();
  vi.mocked(api.exportMeeting).mockImplementationOnce(() => ok(false));
  await user.click(dialog.getByRole('button', { name: 'Enregistrer sous…' }));
  expect(api.exportMeeting).toHaveBeenLastCalledWith('m1', 'transcript');
  expect(dialog.queryByRole('alert')).toBeNull();
  vi.mocked(api.exportMeeting).mockResolvedValueOnce({ ok: false, error: 'Export impossible.' });
  await user.click(dialog.getByRole('button', { name: 'Enregistrer sous…' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('Export impossible.');
});
