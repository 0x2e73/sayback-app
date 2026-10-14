import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { ALL_MEETINGS, filterMeetings, resolveScope, type FolderScope } from './list-filter';

/** The folder filter and the search, owned above the pane so they outlive it. */
export function useListFilter(meetings: Meeting[], folders: Folder[]) {
  const [chosenScope, setScope] = useState<FolderScope>(ALL_MEETINGS);
  const [query, setQuery] = useState('');
  const scope = resolveScope(chosenScope, folders);
  // Typing stays responsive on a long list: the filtering follows a beat behind.
  const deferredQuery = useDeferredValue(query);
  const visible = useMemo(
    () => filterMeetings(meetings, scope, deferredQuery),
    [meetings, scope, deferredQuery],
  );
  const clear = useCallback(() => {
    setScope(ALL_MEETINGS);
    setQuery('');
  }, []);
  return { scope, query, visible, setScope, setQuery, clear };
}
