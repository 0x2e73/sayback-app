import { useState } from 'react';
import {
  defaultCapturePrefs,
  defaultScreenId,
  hasAudioSource,
  normalizeSelection,
  type SourceKey,
  type SourceToggles,
} from '../../../shared/capture-selection';
import type { DesktopApi } from '../../../shared/contracts';
import { useCapturePermission } from './use-capture-permission';
import { useCapturePrefs } from './use-capture-prefs';
import { useCaptureSources } from './use-capture-sources';

/**
 * What the dialog offers: the remembered habits, then the user's edits on top. Everything else
 * (the screen to share, a blocked microphone) is computed from them, never stored.
 */
export function useMeetingSelection(api: DesktopApi) {
  const { prefs, remember } = useCapturePrefs(api);
  const sources = useCaptureSources(api);
  const microphonePermission = useCapturePermission(api, 'microphone');
  const screenPermission = useCapturePermission(api, 'screen');
  const [chosen, setChosen] = useState<SourceToggles | null>(null);
  const [chosenSourceId, setChosenSourceId] = useState('');
  const [chosenAnalysis, setChosenAnalysis] = useState<boolean | null>(null);

  const habits = prefs ?? defaultCapturePrefs;
  const { microphone, systemAudio, screen } = habits;
  const toggles = normalizeSelection(chosen ?? { microphone, systemAudio, screen });
  const microphoneBlocked = microphonePermission === 'denied';
  const selection: SourceToggles = {
    ...toggles,
    microphone: toggles.microphone && !microphoneBlocked,
  };
  const list = sources.state.status === 'ready' ? sources.state.sources : [];
  const sourceId = list.some((source) => source.id === chosenSourceId)
    ? chosenSourceId
    : defaultScreenId(list, habits.screenId);

  function toggle(key: SourceKey): void {
    setChosen(normalizeSelection({ ...toggles, [key]: !selection[key] }, key));
  }

  return {
    ready: prefs !== null,
    habits,
    toggles,
    selection,
    hasAudio: hasAudioSource(selection),
    microphoneBlocked,
    screenBlocked: selection.screen && screenPermission === 'denied',
    sources: sources.state,
    reloadSources: sources.reload,
    source: list.find((item) => item.id === sourceId),
    sourceId,
    autoAnalyze: chosenAnalysis ?? habits.autoAnalyze,
    toggle,
    withoutScreen: () => setChosen(normalizeSelection({ ...toggles, screen: false }, 'screen')),
    chooseSource: setChosenSourceId,
    chooseAnalysis: setChosenAnalysis,
    remember,
  };
}
