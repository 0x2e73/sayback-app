import { useEffect, useState } from 'react';
import { Notice, type LevelFeed } from '../../components/ui';

export const SILENCE_DELAY = 10_000;
// Below this mean of the spectrum, nothing is being said.
const SILENCE_LEVEL = 0.01;

interface SilenceNoticeProps {
  feed: LevelFeed;
}

/** Warns after ten seconds without sound. Mounted only while recording: a pause resets it. */
export function SilenceNotice({ feed }: SilenceNoticeProps) {
  const [silent, setSilent] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setSilent(true), SILENCE_DELAY);
    const stopListening = feed.onLevel((level) => {
      if (level < SILENCE_LEVEL) return;
      clearTimeout(timer);
      setSilent(false);
      timer = setTimeout(() => setSilent(true), SILENCE_DELAY);
    });
    return () => {
      clearTimeout(timer);
      stopListening();
    };
  }, [feed]);
  if (!silent) return null;
  return <Notice tone="warning">Aucun son détecté. Vérifiez votre micro.</Notice>;
}
