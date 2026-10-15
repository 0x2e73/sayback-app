import { useState } from 'react';

/**
 * Ids that were not there when the list first loaded: they get an entrance, the rest of the
 * list does not. Filtering and searching only hide rows, so they never count as arrivals.
 */
export function useArrivals(ids: readonly string[], ready: boolean): ReadonlySet<string> {
  const [known, setKnown] = useState<ReadonlySet<string> | null>(null);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  if (!ready) return arrived;
  if (known === null) {
    setKnown(new Set(ids));
    return arrived;
  }
  const fresh = ids.filter((id) => !known.has(id) && !arrived.has(id));
  if (fresh.length > 0) setArrived(new Set([...arrived, ...fresh]));
  return arrived;
}
