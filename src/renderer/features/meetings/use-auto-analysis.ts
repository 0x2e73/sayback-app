import { useCallback, useState } from 'react';
import { unwrap, type DesktopApi, type Meeting } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

export function useAutoAnalysis(
  api: Pick<DesktopApi, 'processMeeting' | 'getMeeting'>,
  onUpdate: (meeting: Meeting) => void,
) {
  const [error, setError] = useState('');

  const run = useCallback(
    (meeting: Meeting) => {
      setError('');
      onUpdate({
        ...meeting,
        status: 'processing',
        processingStartedAt: new Date().toISOString(),
      });
      void (async () => {
        try {
          onUpdate(unwrap(await api.processMeeting(meeting.id)));
        } catch (failure) {
          setError(errorMessage(failure));
          try {
            onUpdate(unwrap(await api.getMeeting(meeting.id)));
          } catch {
            onUpdate(meeting);
          }
        }
      })();
    },
    [api, onUpdate],
  );

  return { error, run, clearError: () => setError('') };
}
