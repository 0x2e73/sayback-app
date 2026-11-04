import { useRef, useState } from 'react';
import { unwrap, type DesktopApi, type Meeting } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

export function useMeetingTitle(
  api: DesktopApi,
  meeting: Meeting,
  onUpdate: (meeting: Meeting) => void,
) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(meeting.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const changed = title.trim() !== meeting.title && title.trim().length > 0;

  function show(): void {
    setTitle(meeting.title);
    setError('');
    setOpen(true);
  }

  async function save(): Promise<void> {
    if (pending.current || !changed) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      onUpdate(unwrap(await api.renameMeeting(meeting.id, title.trim())));
      setOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return { open, title, setTitle, busy, error, changed, show, save, close: () => setOpen(false) };
}
