import { useCallback, useEffect, useState } from 'react';
import {
  unwrap,
  type DesktopApi,
  type LocalSetupStatus,
  type SetupGuide,
} from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

export function useLocalSetup(api: DesktopApi) {
  const [status, setStatus] = useState<LocalSetupStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      setStatus(unwrap(await api.checkLocalSetup()));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setChecking(false);
    }
  }, [api]);

  useEffect(() => {
    void check();
  }, [check]);

  async function openGuide(guide: SetupGuide) {
    setError('');
    try {
      unwrap(await api.openSetupGuide(guide));
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return { status, checking, error, check, openGuide };
}
