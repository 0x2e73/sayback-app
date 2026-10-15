import { useEffect, useRef, useState } from 'react';
import {
  RATE_LIMITED,
  unwrap,
  type DesktopApi,
  type Folder,
  type Meeting,
} from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';
import { menuRequest, type MenuPlace } from './row-menu';

interface RowMenuOptions {
  api: DesktopApi;
  meetings: Meeting[];
  folders: Folder[];
  onMove(meetingId: string, folderId: string | null): Promise<boolean>;
  /** The meeting is gone from the disk: the list lets go of it. */
  onDeleted(meetingId: string): void;
}

/**
 * The native menu of a row. The main process only draws it: the move is the one the drag and
 * drop uses, and the deletion waits for the confirmation dialog.
 */
export function useRowMenu({ api, meetings, folders, onMove, onDeleted }: RowMenuOptions) {
  const [target, setTarget] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  // The menu is modal: the library may have changed by the time it answers.
  const latestMeetings = useRef(meetings);
  useEffect(() => {
    latestMeetings.current = meetings;
  }, [meetings]);

  function report(failure: unknown): void {
    const message = errorMessage(failure);
    // A menu asked too fast just does not open.
    if (message !== RATE_LIMITED) setError(message);
  }

  async function open(meeting: Meeting, at?: MenuPlace): Promise<void> {
    try {
      const choice = unwrap(await api.openMeetingMenu(menuRequest(meeting, folders, at)));
      setError('');
      const current = latestMeetings.current.find((item) => item.id === meeting.id);
      if (!current || !choice) return;
      if (choice.kind === 'delete') setTarget(current);
      if (choice.kind === 'move' && choice.folderId !== (current.folderId ?? null)) {
        await onMove(current.id, choice.folderId);
      }
    } catch (failure) {
      report(failure);
    }
  }

  async function confirm(): Promise<boolean> {
    if (!target) return false;
    setDeleting(true);
    try {
      unwrap(await api.deleteMeeting(target.id));
      onDeleted(target.id);
      return true;
    } catch (failure) {
      report(failure);
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
