import { errorMessage } from '../../../shared/format';
import { useCallback, useEffect, useState } from 'react';
import { unwrap, type DesktopApi, type Meeting } from '../../../shared/contracts';

export function useMeetings(api: DesktopApi) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setMeetings(unwrap(await api.listMeetings()));
      setError('');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  const processing = meetings.some((meeting) => meeting.status === 'processing');
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => {
      void refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [processing, refresh]);

  const update = useCallback((meeting: Meeting) => {
    setMeetings((current) => {
      if (!current.some((item) => item.id === meeting.id)) return [meeting, ...current];
      return current.map((item) => (item.id === meeting.id ? meeting : item));
    });
  }, []);

  return { meetings, loading, error, refresh, update };
}
