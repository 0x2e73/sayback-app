import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultMeetingTitle,
  hasAudioSource,
  normalizeSelection,
  type SourceKey,
  type SourceToggles,
} from '../../shared/capture-selection';
import type { IslandApi } from '../../shared/contracts';
import type { IslandReadyState, IslandRequest, IslandScreen } from '../../shared/island';
import type { IslandStart, RecordingStartError } from '../../shared/recording-start';

/**
 * What replaces the screen line. The audio rule is checked here at once; a failed or interrupted
 * start shows whatever the chips; the screen errors only matter with the screen on, and a refusal
 * reported by main names the cause better than a missing screen.
 */
export function readyLineError(
  selection: SourceToggles,
  screen: IslandScreen | null,
  reported: RecordingStartError | null,
): RecordingStartError | null {
  if (!hasAudioSource(selection)) return 'no-audio-source';
  if (reported === 'failed' || reported === 'interrupted') return reported;
  if (!selection.screen) return null;
  if (reported === 'screen-denied') return reported;
  if (!screen) return 'no-screen';
  return reported === 'no-screen' ? reported : null;
}

/** Left as it was offered, the title names the moment the recording starts, as in the dialog. */
export function startRequest(selection: SourceToggles, screen: IslandScreen | null): IslandStart {
  const title = defaultMeetingTitle(new Date());
  if (selection.screen && screen) {
    return { type: 'start', title, selection: { ...selection, screenId: screen.id } };
  }
  return { type: 'start', title, selection };
}

/**
 * The chips, set once from the remembered sources, then the start and its answer. The error of
 * the last start stays until the next answer, or until the user tries another screen: main sends
 * no state after a failed start.
 */
export function useReadyStart(
  api: IslandApi,
  ready: IslandReadyState,
  onRequest: (request: IslandRequest) => void,
) {
  const [selection, setSelection] = useState(() => normalizeSelection(ready.remembered));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<RecordingStartError | null>(null);
  // A state update is too late to stop a second click fired in the same tick.
  const sending = useRef(false);

  const fail = useCallback((error: RecordingStartError) => {
    sending.current = false;
    setBusy(false);
    setFailure(error);
  }, []);

  // A success ends nothing here: the recording state that follows replaces this content.
  useEffect(
    () =>
      api.onStartResult((outcome) => {
        if (outcome.ok) setFailure(null);
        else fail(outcome.error);
      }),
    [api, fail],
  );

  const canStart = hasAudioSource(selection) && (!selection.screen || ready.screen !== null);

  function toggle(key: SourceKey): void {
    setSelection((current) => normalizeSelection({ ...current, [key]: !current[key] }, key));
  }

  function start(): void {
    if (sending.current || !canStart) return;
    sending.current = true;
    setBusy(true);
    api.request(startRequest(selection, ready.screen)).then(
      (result) => {
        if (!result.ok) fail('failed');
      },
      () => fail('failed'),
    );
  }

  /** A picked screen and « Réessayer » are a new attempt: main reports what it finds. */
  function request(wanted: IslandRequest): void {
    if (wanted === 'refresh-screens') setFailure(null);
    if (typeof wanted === 'object' && wanted.type === 'select-screen') setFailure(null);
    onRequest(wanted);
  }

  return {
    selection,
    busy,
    canStart,
    // Busy, nothing from before is shown: the answer will say.
    error: busy ? null : readyLineError(selection, ready.screen, failure ?? ready.error),
    toggle,
    start,
    request,
  };
}

export type ReadyStart = ReturnType<typeof useReadyStart>;
