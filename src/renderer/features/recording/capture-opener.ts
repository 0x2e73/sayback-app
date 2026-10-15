import { useCallback, useRef } from 'react';
import type { DesktopApi } from '../../../shared/contracts';
import { CaptureSession, type CaptureOptions } from './capture-session';

/** What holds the one capture: nothing, a running recording, or an interrupted one not yet seen. */
export type CaptureHold = 'free' | 'running' | 'interrupted';

export function captureHold(running: boolean, interrupted: boolean): CaptureHold {
  if (interrupted) return 'interrupted';
  return running ? 'running' : 'free';
}

/** A start refused while the one capture is held. */
export class CaptureBusy extends Error {
  constructor(readonly hold: Exclude<CaptureHold, 'free'>) {
    super('Un enregistrement est déjà en cours.');
  }
}

/**
 * Opens the capture. One that opens after its deadline is stopped before it is ever shown or
 * announced: the main process has already told the island it failed.
 */
async function openCapture(
  api: DesktopApi,
  title: string,
  options: CaptureOptions,
  deadline: number | undefined,
): Promise<CaptureSession> {
  const session = await CaptureSession.start(api, title, options);
  if (deadline === undefined || Date.now() <= deadline) return session;
  await session.stop().catch(() => undefined);
  throw new Error('Le démarrage a pris trop de temps.');
}

/**
 * The dialog and the island both start here: one capture at a time, a second start refused
 * even while the first one is still opening.
 */
export function useCaptureOpener(api: DesktopApi) {
  const opening = useRef(false);
  return useCallback(
    async (hold: CaptureHold, title: string, options: CaptureOptions, deadline?: number) => {
      if (hold !== 'free') throw new CaptureBusy(hold);
      if (opening.current) throw new CaptureBusy('running');
      opening.current = true;
      try {
        return await openCapture(api, title, options, deadline);
      } finally {
        opening.current = false;
      }
    },
    [api],
  );
}
