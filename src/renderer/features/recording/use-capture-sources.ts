import { useEffect, useState } from 'react';
import { errorMessage } from '../../../shared/format';
import { unwrap, type CaptureSource, type DesktopApi } from '../../../shared/contracts';

export type SourcesState =
  | { status: 'loading' }
  | { status: 'ready'; sources: CaptureSource[] }
  | { status: 'error'; message: string };

const LOADING: SourcesState = { status: 'loading' };

async function readSources(api: DesktopApi): Promise<SourcesState> {
  try {
    return { status: 'ready', sources: unwrap(await api.getSources()) };
  } catch (failure) {
    return { status: 'error', message: errorMessage(failure) };
  }
}

/** Screens and windows on offer; `reload` lists them again (« Réessayer », « Actualiser »). */
export function useCaptureSources(api: DesktopApi) {
  const [state, setState] = useState<SourcesState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void readSources(api).then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [api, attempt]);

  function reload() {
    setState(LOADING);
    setAttempt((count) => count + 1);
  }

  return { state, reload };
}
