import { useCallback, useState } from 'react';
import type { NotesProvider } from '../../../shared/contracts';

export function useNotesModel() {
  const [model, setModel] = useState('gpt-4.1-mini');
  const [removed, setRemoved] = useState('');

  /** A choice, typed or picked, settles the question of a model that went missing. */
  const choose = useCallback((value: string) => {
    setModel(value);
    setRemoved('');
  }, []);

  /**
   * Once the list is known, a stored model it no longer offers is dropped, and said so. A
   * compatible API keeps its model: its list can be partial and the ID typed by hand.
   */
  const reconcile = useCallback(
    (provider: NotesProvider, wanted: string, available: readonly string[]) => {
      if (provider === 'compatible' || !wanted || !available.length) return;
      if (available.includes(wanted)) return;
      setModel('');
      setRemoved(wanted);
    },
    [],
  );

  return { model, removed, choose, reconcile };
}
