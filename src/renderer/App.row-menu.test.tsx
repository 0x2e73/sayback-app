// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  RATE_LIMITED,
  type DesktopApi,
  type Meeting,
  type MeetingMenuChoice,
} from '../shared/contracts';
import { App } from './App';
import { apiFor, meetingFixture, ok } from './test-api';

afterEach(cleanup);

const acme = { id: 'f1', name: 'Acme', createdAt: '' };
const newer = meetingFixture('new', 'Revue produit', '2026-10-14T08:00:00Z');
const older = meetingFixture('old', 'Point hebdo', '2026-10-12T08:00:00Z', { folderId: 'f1' });

function setup(choice: MeetingMenuChoice, meetings: Meeting[] = [newer, older]) {
  const api = apiFor(meetings);
  api.listFolders = () => ok([acme]);
  const openMeetingMenu = vi.fn<DesktopApi['openMeetingMenu']>(async () => ({
    ok: true as const,
    value: choice,
  }));
  api.openMeetingMenu = openMeetingMenu;
  api.moveMeeting = vi.fn(async (id, folderId) =>
    ok({ ...meetings.find((meeting) => meeting.id === id)!, folderId: folderId ?? undefined }),
  );
  api.deleteMeeting = vi.fn(() => ok(undefined));
  return { api, openMeetingMenu };
}

const row = (name: RegExp) => screen.findByRole('option', { name });

describe('The menu of a meeting row', () => {
  it('opens on a right-click with the folders and the current one', async () => {
    const { api, openMeetingMenu } = setup(null);
    render(<App api={api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    await waitFor(() => expect(openMeetingMenu).toHaveBeenCalledTimes(1));
    expect(openMeetingMenu).toHaveBeenCalledWith({
      meetingId: 'old',
      folders: [{ id: 'f1', name: 'Acme' }],
      folderId: 'f1',
      disabled: false,
    });
  });

  it('opens from Shift+F10 and from the menu key, under the focused row', async () => {
    const { api, openMeetingMenu } = setup(null);
    render(<App api={api} />);
    const target = await row(/Point hebdo/);
    fireEvent.keyDown(target, { key: 'F10', shiftKey: true });
    fireEvent.keyDown(target, { key: 'ContextMenu' });
    await waitFor(() => expect(openMeetingMenu).toHaveBeenCalledTimes(2));
    expect(openMeetingMenu.mock.calls[0]?.[0]).toMatchObject({
      meetingId: 'old',
      at: expect.any(Object),
    });
  });

  it('ignores F10 without Shift', async () => {
    const { api, openMeetingMenu } = setup(null);
    render(<App api={api} />);
    fireEvent.keyDown(await row(/Point hebdo/), { key: 'F10' });
    expect(openMeetingMenu).not.toHaveBeenCalled();
  });

  it('moves through the action drag and drop uses, then changes nothing else', async () => {
    const { api } = setup({ kind: 'move', folderId: null });
    render(<App api={api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    await waitFor(() => expect(api.moveMeeting).toHaveBeenCalledWith('old', null));
    expect(api.deleteMeeting).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does nothing when the menu is dismissed or the folder is the current one', async () => {
    const dismissed = setup(null);
    render(<App api={dismissed.api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    await waitFor(() => expect(dismissed.openMeetingMenu).toHaveBeenCalled());
    cleanup();
    const same = setup({ kind: 'move', folderId: 'f1' });
    render(<App api={same.api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    await waitFor(() => expect(same.openMeetingMenu).toHaveBeenCalled());
    expect(dismissed.api.moveMeeting).not.toHaveBeenCalled();
    expect(same.api.moveMeeting).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks for confirmation before deleting, and keeps the meeting when cancelled', async () => {
    const user = userEvent.setup();
    const { api } = setup({ kind: 'delete' });
    render(<App api={api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer cette réunion ?' });
    expect(api.deleteMeeting).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.deleteMeeting).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: /Point hebdo/ })).toBeInTheDocument();
  });

  it('deletes the right-clicked row once confirmed, leaving the card on the other meeting', async () => {
    const user = userEvent.setup();
    const { api } = setup({ kind: 'delete' });
    render(<App api={api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer cette réunion ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(api.deleteMeeting).toHaveBeenCalledWith('old'));
    await waitFor(() => expect(screen.queryByRole('option', { name: /Point hebdo/ })).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Revue produit' })).toBeInTheDocument();
  });

  it('says so, and keeps the row, when the deletion fails', async () => {
    const user = userEvent.setup();
    const { api } = setup({ kind: 'delete' });
    api.deleteMeeting = async () => ({ ok: false, error: 'Disque plein' });
    render(<App api={api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer cette réunion ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect(
      await within(dialog).findByText('La suppression a échoué. Réessayez.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Point hebdo/ })).toBeInTheDocument();
  });

  it('asks for the menu with both actions disabled for a meeting being recorded or analysed', async () => {
    const recording = meetingFixture('rec', 'Appel en cours', '2026-10-15T08:00:00Z', {
      status: 'recording',
    });
    const analysing = meetingFixture('ana', 'Analyse', '2026-10-15T07:00:00Z', {
      status: 'processing',
    });
    const { api, openMeetingMenu } = setup(null, [recording, analysing, older]);
    render(<App api={api} />);
    fireEvent.contextMenu(await row(/Appel en cours/));
    fireEvent.contextMenu(await row(/Analyse/));
    fireEvent.contextMenu(await row(/Point hebdo/));
    await waitFor(() => expect(openMeetingMenu).toHaveBeenCalledTimes(3));
    expect(openMeetingMenu.mock.calls.map(([request]) => request.disabled)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('shows the failure of the menu in the notice', async () => {
    const { api } = setup(null);
    api.openMeetingMenu = async () => ({ ok: false, error: 'Menu indisponible' });
    render(<App api={api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    expect(await screen.findByRole('alert')).toHaveTextContent('Menu indisponible');
  });

  it('stays silent when the menu is asked too fast', async () => {
    const { api, openMeetingMenu } = setup(null);
    api.openMeetingMenu = vi.fn(async () => ({ ok: false as const, error: RATE_LIMITED }));
    render(<App api={api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    await waitFor(() => expect(api.openMeetingMenu).toHaveBeenCalled());
    expect(openMeetingMenu).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports a failed deletion in the notice as well as in the dialog', async () => {
    const user = userEvent.setup();
    const { api } = setup({ kind: 'delete' });
    api.deleteMeeting = async () => ({ ok: false, error: 'Disque plein' });
    render(<App api={api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer cette réunion ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect((await screen.findAllByText('Disque plein')).length).toBeGreaterThan(0);
  });

  it('ignores the answer for a meeting that left the library while the menu was open', async () => {
    const user = userEvent.setup();
    const { api } = setup(null);
    let answer: (value: { ok: true; value: MeetingMenuChoice }) => void = () => {};
    const asked = vi
      .fn<DesktopApi['openMeetingMenu']>()
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
      .mockResolvedValue({ ok: true, value: { kind: 'delete' } });
    api.openMeetingMenu = asked;
    render(<App api={api} />);
    const target = await row(/Point hebdo/);
    fireEvent.contextMenu(target);
    fireEvent.contextMenu(target);
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer cette réunion ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    answer({ ok: true, value: { kind: 'delete' } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.deleteMeeting).toHaveBeenCalledTimes(1);
  });

  it('compares with the folder the meeting has now, not the one it had at the click', async () => {
    const { api } = setup({ kind: 'move', folderId: 'f1' });
    let answer: (value: { ok: true; value: MeetingMenuChoice }) => void = () => {};
    api.openMeetingMenu = () => new Promise((resolve) => (answer = resolve));
    render(<App api={api} />);
    fireEvent.contextMenu(await row(/Point hebdo/));
    answer({ ok: true, value: { kind: 'move', folderId: null } });
    await waitFor(() => expect(api.moveMeeting).toHaveBeenCalledWith('old', null));
  });

  it('does not choose the row on a Ctrl+click of a Mac', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const { api } = setup(null);
    render(<App api={api} />);
    const target = await row(/Point hebdo/);
    fireEvent.click(target, { ctrlKey: true });
    expect(target).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(target);
    expect(target).toHaveAttribute('aria-selected', 'true');
    vi.restoreAllMocks();
  });
});
