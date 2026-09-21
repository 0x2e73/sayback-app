import { useEffect, useState } from 'react';
import { unwrap, type DesktopApi } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

type OnboardingState = 'loading' | 'show' | 'done';

export function useOnboarding(api: DesktopApi) {
  const [state, setState] = useState<OnboardingState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api
      .getSettings()
      .then(unwrap)
      .then((settings) => {
        if (active) setState(settings.onboardingCompleted ? 'done' : 'show');
      })
      .catch(() => {
        if (active) setState('done');
      });
    return () => {
      active = false;
    };
  }, [api]);

  async function complete() {
    setBusy(true);
    setError('');
    try {
      unwrap(await api.completeOnboarding());
      setState('done');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function reopen() {
    setError('');
    setState('show');
  }

  return { state, busy, error, complete, reopen };
}
