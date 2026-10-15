import type { Folder, Meeting } from '../../../shared/contracts';
import { Presence } from '../../components/Presence';
import { useHeld } from '../../components/use-held';
import { EmptyState, Skeleton } from '../../components/ui';
import type { DateGroup } from './date-groups';
import { emptyList, type FolderScope } from './list-filter';
import { MeetingList } from './MeetingList';

interface ListBodyProps {
  loading: boolean;
  groups: DateGroup<Meeting>[];
  total: number;
  scope: FolderScope;
  query: string;
  folders: Folder[];
  selectedId: string | null;
  now: Date;
  locked: boolean;
  arrivedIds: ReadonlySet<string>;
  onSelect(id: string, by?: 'keyboard'): void;
  onSearchEverywhere(): void;
}

function ListSkeleton() {
  return (
    <>
      <p className="sr-only" role="status">
        Chargement des réunions…
      </p>
      <div className="list-skeleton" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="skeleton-row">
            <Skeleton />
            <Skeleton short />
          </div>
        ))}
      </div>
    </>
  );
}

type View = 'loading' | 'empty' | 'list';

function viewOf(props: ListBodyProps): View {
  if (props.loading) return 'loading';
  return props.groups.length === 0 ? 'empty' : 'list';
}

/**
 * Loading, empty and loaded are three views that cross-fade: the one that leaves keeps what it
 * showed, lays over the new one and fades at the exit speed, so a state never cuts to the next.
 */
export function ListBody(props: ListBodyProps) {
  const view = viewOf(props);
  const empty = emptyList(props);
  const message = useHeld(view === 'empty' ? empty.message : null);
  const searchEverywhere = useHeld(view === 'empty' ? empty.searchEverywhere : null);
  const groups = useHeld(view === 'list' ? props.groups : null);
  return (
    <>
      <Presence open={view === 'loading'}>
        {({ ref, state }) => (
          <div ref={ref} className="list-view" data-state={state}>
            <ListSkeleton />
          </div>
        )}
      </Presence>
      <Presence open={view === 'empty'}>
        {({ ref, state }) => (
          <div ref={ref} className="list-view" data-state={state}>
            <EmptyState title={message ?? ''}>
              {searchEverywhere && (
                <button type="button" className="text-link" onClick={props.onSearchEverywhere}>
                  Chercher dans toutes les réunions
                </button>
              )}
            </EmptyState>
          </div>
        )}
      </Presence>
      <Presence open={view === 'list'}>
        {({ ref, state }) => (
          <div ref={ref} className="list-view" data-state={state}>
            <MeetingList
              groups={groups ?? props.groups}
              folders={props.folders}
              selectedId={props.selectedId}
              now={props.now}
              locked={props.locked}
              arrivedIds={props.arrivedIds}
              onSelect={props.onSelect}
            />
          </div>
        )}
      </Presence>
    </>
  );
}
