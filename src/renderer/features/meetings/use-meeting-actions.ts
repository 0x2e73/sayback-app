import { errorMessage } from '../../../shared/format';
import { useState } from 'react';
import { unwrap, type DesktopApi, type Meeting } from '../../../shared/contracts';
import { analysisConfigured } from '../../../shared/analysis-settings';

interface MeetingActionsOptions {
  api: DesktopApi;
  meeting: Meeting;
  onUpdate(meeting: Meeting): void;
  onDeleted(): void;
}

export function useMeetingActions({ api, meeting, onUpdate, onDeleted }: MeetingActionsOptions) {
  const [pending, setPending] = useState<'analysis' | 'clarification' | 'deletion' | null>(null);
  const [error, setError] = useState('');

  async function analyze() {
    setPending('analysis');
    setError('');
    try {
      const settings = unwrap(await api.getSettings());
      if (!analysisConfigured(settings)) {
        throw new Error('Configurez la transcription et le compte rendu dans les paramètres.');
      }
      onUpdate({ ...meeting, status: 'processing' });
      onUpdate(unwrap(await api.processMeeting(meeting.id)));
    } catch (failure) {
      setError(errorMessage(failure));
      const restored = await api.getMeeting(meeting.id).catch(() => null);
      if (restored?.ok) onUpdate(restored.value);
    } finally {
      setPending(null);
    }
  }

  async function clarify(at: number, text: string): Promise<boolean> {
    setPending('clarification');
    setError('');
    try {
      onUpdate(unwrap(await api.clarify(meeting.id, at, text)));
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function remove(): Promise<boolean> {
    setPending('deletion');
    setError('');
    try {
      unwrap(await api.deleteMeeting(meeting.id));
      onDeleted();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setPending(null);
    }
  }

  return {
    error,
    analyzing: pending === 'analysis' || meeting.status === 'processing',
    saving: pending === 'clarification',
    deleting: pending === 'deletion',
    analyze,
    clarify,
    remove,
  };
}
