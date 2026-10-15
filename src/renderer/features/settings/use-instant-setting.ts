import { useState } from 'react';
import { unwrap, type Result } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

/**
 * A setting applied at once and on its own, outside the save button: stored first, shown
 * once stored; one change at a time.
 */
export function useInstantSetting<T>(
  current: T,
  store: (value: T) => Promise<Result<void>>,
  apply: (value: T) => void,
) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function choose(value: T) {
    if (value === current || busy) return;
    setBusy(true);
    try {
      unwrap(await store(value));
      apply(value);
      setError('');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return { error, busy, choose };
}
