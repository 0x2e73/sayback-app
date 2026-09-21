import { errorMessage } from '../../../shared/format';
import { useEffect, useState, type FormEvent } from 'react';
import {
  unwrap,
  type CaptureSource,
  type DesktopApi,
  type Settings,
} from '../../../shared/contracts';
import { analysisConfigured } from '../../../shared/analysis-settings';

import type { CaptureOptions } from './capture-session';

export type CaptureSelection = Omit<CaptureOptions, 'onFailure' | 'onEnded'>;
export type StartMeeting = (
  title: string,
  options: CaptureSelection,
  autoAnalyze: boolean,
) => Promise<void>;

export function useNewMeeting(api: DesktopApi, onStart: StartMeeting) {
  const [title, setTitle] = useState('');
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [selection, setSelection] = useState<CaptureSelection>({
    screen: true,
    microphone: true,
    systemAudio: true,
  });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void api
      .getSources()
      .then(unwrap)
      .then((items) => {
        setSources(items);
        setSourceId(items[0]?.id ?? '');
      })
      .catch((failure: unknown) => setError(errorMessage(failure)));
  }, [api]);

  useEffect(() => {
    void api
      .getSettings()
      .then(unwrap)
      .then(setSettings)
      .catch((failure: unknown) => setError(errorMessage(failure)));
  }, [api]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (selection.screen) unwrap(await api.selectSource(sourceId, selection.systemAudio));
      await onStart(
        title,
        {
          ...selection,
          systemAudio: selection.screen && selection.systemAudio,
          source: selection.screen ? sources.find((source) => source.id === sourceId) : undefined,
        },
        autoAnalyze && Boolean(settings && analysisConfigured(settings)),
      );
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  async function openPrivacySettings() {
    try {
      unwrap(await api.openScreenRecordingSettings());
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  const hasAudio = selection.microphone || (selection.screen && selection.systemAudio);
  const hasSource = !selection.screen || Boolean(sourceId);
  return {
    title,
    setTitle,
    sources,
    sourceId,
    setSourceId,
    selection,
    setSelection,
    settings,
    hasAnalysis: Boolean(settings && analysisConfigured(settings)),
    autoAnalyze,
    setAutoAnalyze,
    busy,
    error,
    openPrivacySettings,
    submit,
    canStart: Boolean(title.trim()) && hasAudio && hasSource,
  };
}
