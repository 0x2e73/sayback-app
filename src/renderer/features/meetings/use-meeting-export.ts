import { useRef, useState } from 'react';
import { unwrap, type DesktopApi, type MeetingExportKind } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

export function useMeetingExport(api: DesktopApi, id: string) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function save(kind: MeetingExportKind): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (unwrap(await api.exportMeeting(id, kind))) setOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return {
    open,
    busy,
    error,
    save,
    show: () => {
      setError('');
      setOpen(true);
    },
    close: () => setOpen(false),
  };
}
