import { useState } from 'react';
import type { DesktopApi } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

export interface UpdateInstall {
  busy: boolean;
  /** The sentence to show in the workspace notice; empty when the last attempt did not fail. */
  error: string;
  install(): Promise<void>;
}

// `started` quits the app and `postponed` is a choice: neither needs a message.
export function useUpdateInstall(api: DesktopApi): UpdateInstall {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function install(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.installUpdate();
      if (!result.ok) setError(result.error);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, install };
}
