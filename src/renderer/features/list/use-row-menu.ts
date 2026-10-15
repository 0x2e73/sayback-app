import { useState } from 'react';
import { unwrap, type DesktopApi, type Folder, type Meeting } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';
import { menuRequest, type MenuPlace } from './row-menu';

interface RowMenuOptions {
  api: DesktopApi;
  folders: Folder[];
  onMove(meetingId: string, folderId: string | null): Promise<boolean>;
  /** The meeting is gone from the disk: the list lets go of it. */
  onDeleted(meetingId: string): void;
}

/**
 * The native menu of a row. The main process only draws it: the move is the one the drag and
 * drop uses, and the deletion waits for the confirmation dialog.
 */
export function useRowMenu({ api, folders, onMove, onDeleted }: RowMenuOptions) {
  const [target, setTarget] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function open(meeting: Meeting, at?: MenuPlace): Promise<void> {
    try {
      const choice = unwrap(await api.openMeetingMenu(menuRequest(meeting, folders, at)));
      setError('');
      if (choice?.kind === 'delete') setTarget(meeting);
      if (choice?.kind !== 'move') return;
      if (choice.folderId !== (meeting.folderId ?? null)) await onMove(meeting.id, choice.folderId);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  async function confirm(): Promise<boolean> {
    if (!target) return false;
    setDeleting(true);
    try {
      unwrap(await api.deleteMeeting(target.id));
      onDeleted(target.id);
      return true;
    } catch {
      return false;
    } finally {
      setDeleting(false);
    }
  }

  return {
    open,
    error,
    deletion: { open: target !== null, busy: deleting, confirm, cancel: () => setTarget(null) },
  };
}
