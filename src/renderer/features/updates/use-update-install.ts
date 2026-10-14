import { useRef, useState } from 'react';
import type { DesktopApi, UpdateStatus } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

export interface UpdateInstall {
  busy: boolean;
  /** The sentence to show in the workspace notice; empty once the pushed state has moved on. */
  error: string;
  install(): Promise<void>;
}

interface Failure {
  message: string;
  state: string;
}

function stateKey(status: UpdateStatus | null): string {
  if (!status) return '';
  return [status.available?.commit, status.canInstall, status.reason].join('|');
}

// A failure belongs to the state it happened in: derived, it fades when that state changes.
// `started` quits the app, so the button stays busy; `postponed` is a choice and needs no message.
export function useUpdateInstall(api: DesktopApi, status: UpdateStatus | null): UpdateInstall {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const running = useRef(false);
  const state = stateKey(status);

  async function install(): Promise<void> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailure(null);
    let quitting = false;
    try {
      const result = await api.installUpdate();
      if (result.ok) quitting = result.value === 'started';
      else setFailure({ message: result.error, state });
    } catch (error) {
      setFailure({ message: errorMessage(error), state });
    } finally {
      if (!quitting) {
        running.current = false;
        setBusy(false);
      }
    }
  }

  const error = failure?.state === state ? failure.message : '';
  return { busy, error, install };
}
