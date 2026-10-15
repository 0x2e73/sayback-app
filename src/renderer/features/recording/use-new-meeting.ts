import { useEffect, useRef, useState, type FormEvent } from 'react';
import { defaultMeetingTitle } from '../../../shared/capture-selection';
import { errorMessage } from '../../../shared/format';
import {
  unwrap,
  type CapturePermissionKind,
  type DesktopApi,
  type Settings,
} from '../../../shared/contracts';
import { analysisConfigured } from '../../../shared/analysis-settings';
import { openPrivacySettings } from './open-privacy-settings';
import { launchMeeting, rememberedScreenId, type StartMeeting } from './start-meeting';
import { useMeetingSelection } from './use-meeting-selection';

export function useNewMeeting(api: DesktopApi, onStart: StartMeeting) {
  const choice = useMeetingSelection(api);
  const [defaultTitle] = useState(() => defaultMeetingTitle(new Date()));
  const [typedTitle, setTypedTitle] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A state update is too late to stop a second submit fired in the same tick.
  const submitting = useRef(false);

  useEffect(() => {
    let current = true;
    void api
      .getSettings()
      .then(unwrap)
      .then((read) => {
        if (current) setSettings(read);
      })
      .catch((failure: unknown) => {
        if (current) setError(errorMessage(failure));
      });
    return () => {
      current = false;
    };
  }, [api]);

  const { selection } = choice;
  const analysisReady = Boolean(settings && analysisConfigured(settings));
  const title = typedTitle ?? defaultTitle;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting.current || !canStart) return;
    submitting.current = true;
    setError('');
    setBusy(true);
    try {
      await launchMeeting(api, onStart, {
        title: titleToStart(),
        selection,
        source: choice.source,
        autoAnalyze: choice.autoAnalyze && analysisReady,
        remembered: {
          ...choice.toggles,
          autoAnalyze: choice.autoAnalyze,
          screenId: rememberedScreenId(selection, choice.sourceId, choice.habits.screenId),
        },
      });
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
      submitting.current = false;
    }
  }

  // Left as it was offered, the title names the moment the recording starts, not the opening.
  function titleToStart(): string {
    return typedTitle?.trim() || defaultMeetingTitle(new Date());
  }

  async function openSettings(kind: CapturePermissionKind): Promise<void> {
    try {
      await openPrivacySettings(api, kind);
    } catch (failure) {
      setError(errorMessage(failure));
    }
    choice.refreshPermission(kind);
  }

  const hasSource = !selection.screen || Boolean(choice.sourceId);
  const canStart = choice.ready && choice.hasAudio && hasSource;
  return {
    ...choice,
    title,
    setTitle: setTypedTitle,
    settings,
    analysisReady,
    autoAnalyze: choice.autoAnalyze && analysisReady,
    busy,
    error,
    canStart,
    openSettings,
    submit,
  };
}
