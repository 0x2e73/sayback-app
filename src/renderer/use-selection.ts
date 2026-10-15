import { useCallback, useState } from 'react';
import type { Meeting } from '../shared/contracts';
import { sortNewestFirst } from './features/list/date-groups';
import { neighbourAfter, resolveSelection } from './features/list/selection';

/**
 * The meeting on the card. An arrow key, the first selection or a deletion change the card
 * without an entrance.
 */
export function useSelection(visible: Meeting[], remove: (id: string) => void) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [instant, setInstant] = useState(false);
  const selected = resolveSelection(visible, chosenId);

  // Stable: the recording hook depends on it.
  const choose = useCallback((id: string, withoutEntrance: boolean): void => {
    setChosenId(id);
    setInstant(withoutEntrance);
  }, []);

  // The card moves to the neighbour of its own meeting when that one is deleted; else it stays.
  function deleted(id: string): void {
    if (selected?.id === id) {
      const shown = sortNewestFirst(visible).map((meeting) => meeting.id);
      setChosenId(neighbourAfter(shown, id));
      setInstant(true);
    }
    remove(id);
  }

  return { selected, instantCard: instant || chosenId === null, choose, deleted };
}
