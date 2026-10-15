import { useEffect, useState } from 'react';
import { Presence } from '../../components/Presence';
import { Notice } from '../../components/ui';
import type { SignalListener } from './recording-feed';

export const MISSING_SIGNAL_DELAY = 10_000;

/** Says whether any signal arrives, a quiet room included; returns the unsubscribe function. */
export interface SignalFeed {
  onSignal(listener: SignalListener): () => void;
}

export interface AudioSources {
  microphone: boolean;
  systemAudio: boolean;
}

export function missingSignalText({ microphone, systemAudio }: AudioSources): string {
  if (microphone && !systemAudio) return 'Aucun son reçu du micro.';
  if (systemAudio && !microphone) return 'Aucun son reçu du système.';
  return 'Aucun son reçu.';
}

interface MissingSignalNoticeProps {
  feed: SignalFeed;
  sources: AudioSources;
}

/** Warns when ten seconds pass with no signal. Mounted only while recording: a pause resets it. */
export function MissingSignalNotice({ feed, sources }: MissingSignalNoticeProps) {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setMissing(true), MISSING_SIGNAL_DELAY);
    const stopListening = feed.onSignal((present) => {
      if (!present) return;
      clearTimeout(timer);
      setMissing(false);
      timer = setTimeout(() => setMissing(true), MISSING_SIGNAL_DELAY);
    });
    return () => {
      clearTimeout(timer);
      stopListening();
    };
  }, [feed]);
  return (
    <Presence open={missing}>
      {(presence) => (
        <Notice tone="warning" role="status" presence={presence}>
          {missingSignalText(sources)}
        </Notice>
      )}
    </Presence>
  );
}
