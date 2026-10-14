import { errorMessage } from '../../../shared/format';
import { useCallback, useEffect, useRef, useState } from 'react';
import { unwrap, type DesktopApi, type Meeting } from '../../../shared/contracts';

export function useMeetings(api: DesktopApi) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Bumped by every local change: an answer to an older request must not undo it.
  const generation = useRef(0);
  const inFlight = useRef(false);
  const askAgain = useRef(false);

  // One request. A stale answer is dropped and the list is asked again.
  const loadOnce = useCallback(async () => {
    const asked = generation.current;
    try {
      const list = unwrap(await api.listMeetings());
      if (asked !== generation.current) {
        askAgain.current = true;
        return;
      }
      setMeetings(list);
      setError('');
      setLoading(false);
    } catch (failure) {
      if (asked === generation.current) setError(errorMessage(failure));
    }
  }, [api]);

  // Loading lasts until the first success: a failed first load must not read as an empty library.
  // One request at a time: a call made meanwhile only asks for one more round.
  const refresh = useCallback(async () => {
    if (inFlight.current) {
      askAgain.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        askAgain.current = false;
        await loadOnce();
      } while (askAgain.current);
    } finally {
      inFlight.current = false;
    }
  }, [loadOnce]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  const processing = meetings.some((meeting) => meeting.status === 'processing');
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => {
      if (!inFlight.current) void refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [processing, refresh]);

  const update = useCallback((meeting: Meeting) => {
    generation.current += 1;
    setMeetings((current) => {
      if (!current.some((item) => item.id === meeting.id)) return [meeting, ...current];
      return current.map((item) => (item.id === meeting.id ? meeting : item));
    });
  }, []);

  const remove = useCallback((id: string) => {
    generation.current += 1;
    setMeetings((current) => current.filter((meeting) => meeting.id !== id));
  }, []);

  return { meetings, loading, error, refresh, update, remove };
}
