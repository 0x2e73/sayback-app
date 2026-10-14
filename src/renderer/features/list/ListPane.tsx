import { useMemo, useState } from 'react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { groupByDate } from './date-groups';
import { FolderFilter } from './FolderFilter';
import { ListBody } from './ListBody';
import { ListFooter } from './ListFooter';
import { ALL_MEETINGS, filterMeetings, resolveScope, type FolderScope } from './list-filter';
import { SearchField } from './SearchField';
import { useCurrentDate } from './use-current-date';
import type { FolderActions } from './use-folders';

export interface ListPaneProps {
  meetings: Meeting[];
  folders: Folder[];
  folderActions: FolderActions;
  loading: boolean;
  selectedId: string | null;
  settingsOpen: boolean;
  recording: { readonly elapsed: number } | null;
  onSelect(id: string): void;
  onToggleSettings(): void;
  onNew(): void;
  onShowRecording(): void;
}

export function ListPane(props: ListPaneProps) {
  const { meetings, folders, recording } = props;
  const [chosenScope, setScope] = useState<FolderScope>(ALL_MEETINGS);
  const [query, setQuery] = useState('');
  const now = useCurrentDate();
  const scope = resolveScope(chosenScope, folders);
  const groups = useMemo(
    () => groupByDate(filterMeetings(meetings, scope, query), now),
    [meetings, scope, query, now],
  );
  const locked = recording !== null;

  return (
    <aside className="list-pane" aria-label="Liste des réunions">
      <div className="window-band list-pane-header">
        <SearchField query={query} disabled={locked} onQuery={setQuery} />
      </div>
      <FolderFilter
        folders={folders}
        meetings={meetings}
        scope={scope}
        locked={locked}
        actions={props.folderActions}
        onScope={setScope}
      />
      <div className="list-pane-body">
        <ListBody
          loading={props.loading}
          groups={groups}
          total={meetings.length}
          scope={scope}
          query={query}
          folders={folders}
          selectedId={props.selectedId}
          now={now}
          locked={locked}
          onSelect={props.onSelect}
          onSearchEverywhere={() => setScope(ALL_MEETINGS)}
        />
      </div>
      <ListFooter
        recording={recording}
        settingsOpen={props.settingsOpen}
        onToggleSettings={props.onToggleSettings}
        onNew={props.onNew}
        onShowRecording={props.onShowRecording}
      />
    </aside>
  );
}
