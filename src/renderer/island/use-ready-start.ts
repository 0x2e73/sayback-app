import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultMeetingTitle,
  hasAudioSource,
  normalizeSelection,
  type SourceKey,
  type SourceToggles,
} from '../../shared/capture-selection';
import type { IslandApi } from '../../shared/contracts';
import type { IslandReadyState, IslandScreen } from '../../shared/island';
import type { IslandStart, RecordingStartError } from '../../shared/recording-start';

/** An error of this page's own start, valid until the main process sends a newer state. */
interface StartFailure {
  error: RecordingStartError | null;
  over: IslandReadyState;
}

/**
 * What replaces the screen line. The audio rule is checked here at once, the screen errors only
 * matter with the screen on, and a reported missing audio source is gone once one is back.
 */
export function readyLineError(
  selection: SourceToggles,
  screen: IslandScreen | null,
  reported: RecordingStartError | null,
): RecordingStartError | null {
  if (!hasAudioSource(selection)) return 'no-audio-source';
  if (!selection.screen) return reported === 'failed' ? 'failed' : null;
  if (!screen) return 'no-screen';
  return reported === 'no-audio-source' ? null : reported;
}

/** Left as it was offered, the title names the moment the recording starts, as in the dialog. */
export function startRequest(selection: SourceToggles, screen: IslandScreen | null): IslandStart {
  const title = defaultMeetingTitle(new Date());
  if (selection.screen && screen) {
    return { type: 'start', title, selection: { ...selection, screenId: screen.id } };
  }
  return { type: 'start', title, selection };
}

/** The chips, set once from the remembered sources, then the start and its answer. */
export function useReadyStart(api: IslandApi, ready: IslandReadyState) {
  const [selection, setSelection] = useState(() => normalizeSelection(ready.remembered));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<StartFailure | null>(null);
  // A state update is too late to stop a second click fired in the same tick.
  const sending = useRef(false);
  const latest = useRef(ready);
  useEffect(() => {
    latest.current = ready;
  });

  const fail = useCallback((error: RecordingStartError) => {
    sending.current = false;
    setBusy(false);
    setFailure({ error, over: latest.current });
  }, []);

  // A success is not an answer here: the recording state that follows replaces this content.
  useEffect(
    () =>
      api.onStartResult((outcome) => {
        if (!outcome.ok) fail(outcome.error);
      }),
    [api, fail],
  );

  const reported = failure?.over === ready ? failure.error : ready.error;
  const canStart = hasAudioSource(selection) && (!selection.screen || ready.screen !== null);

  function toggle(key: SourceKey): void {
    setSelection((current) => normalizeSelection({ ...current, [key]: !current[key] }, key));
  }

  function start(): void {
    if (sending.current || !canStart) return;
    sending.current = true;
    setBusy(true);
    setFailure({ error: null, over: ready });
    api.request(startRequest(selection, ready.screen)).then(
      (result) => {
        if (!result.ok) fail('failed');
      },
      () => fail('failed'),
    );
  }

  return {
    selection,
    busy,
    canStart,
    error: readyLineError(selection, ready.screen, reported),
    toggle,
    start,
  };
}
