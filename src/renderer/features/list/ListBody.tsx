import type { Folder, Meeting } from '../../../shared/contracts';
import { EmptyState } from '../../components/ui';
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
  onSelect(id: string): void;
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
            <span className="skeleton-line" />
            <span className="skeleton-line skeleton-line-short" />
          </div>
        ))}
      </div>
    </>
  );
}

export function ListBody(props: ListBodyProps) {
  if (props.loading) return <ListSkeleton />;
  if (props.groups.length === 0) {
    const empty = emptyList(props);
    return (
      <EmptyState title={empty.message}>
        {empty.searchEverywhere && (
          <button type="button" className="text-link" onClick={props.onSearchEverywhere}>
            Chercher dans toutes les réunions
          </button>
        )}
      </EmptyState>
    );
  }
  return (
    <MeetingList
      groups={props.groups}
      folders={props.folders}
      selectedId={props.selectedId}
      now={props.now}
      locked={props.locked}
      onSelect={props.onSelect}
    />
  );
}
