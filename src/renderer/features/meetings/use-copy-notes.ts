import { useEffect, useState } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { notesMarkdown } from './meeting-format';

type CopyState = 'idle' | 'done' | 'failed';

const messages: Record<CopyState, string> = {
  idle: '',
  done: 'Notes copiées.',
  failed: 'La copie a échoué. Réessayez.',
};

export function useCopyNotes(meeting: Meeting) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2_000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(notesMarkdown(meeting));
      setState('done');
    } catch {
      setState('failed');
    }
  }

  return { state, message: messages[state], copy };
}
