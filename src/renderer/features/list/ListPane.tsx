import { SearchField } from '../../components/ui';
import { useMemo } from 'react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { groupByDate } from './date-groups';
import { FolderFilter } from './FolderFilter';
import { ListBody } from './ListBody';
import { ListFooter } from './ListFooter';
import { ALL_MEETINGS, type FolderScope } from './list-filter';
import type { UpdateLineProps } from '../updates/UpdateLine';
import { useCurrentDate } from './use-current-date';
import type { FolderActions } from './use-folders';

export interface ListPaneProps {
  meetings: Meeting[];
  visibleMeetings: Meeting[];
  folders: Folder[];
  scope: FolderScope;
  query: string;
  onScope(scope: FolderScope): void;
  onQuery(query: string): void;
  folderActions: FolderActions;
  loading: boolean;
  selectedId: string | null;
  settingsOpen: boolean;
  recording: { readonly elapsed: number } | null;
  update: UpdateLineProps;
  onSelect(id: string): void;
  onToggleSettings(): void;
  onNew(): void;
  onShowRecording(): void;
}

export function ListPane(props: ListPaneProps) {
  const { meetings, folders, scope, query, recording } = props;
  const now = useCurrentDate();
  const groups = useMemo(
    () => groupByDate(props.visibleMeetings, now),
    [props.visibleMeetings, now],
  );
  const locked = recording !== null;

  return (
    <aside className="list-pane" aria-label="Liste des réunions">
      <div className="window-band list-pane-header">
        <SearchField
          label="Rechercher une réunion"
          placeholder="Rechercher…"
          query={query}
          disabled={locked}
          compact
          findShortcut
          onQuery={props.onQuery}
        />
      </div>
      <FolderFilter
        folders={folders}
        meetings={meetings}
        scope={scope}
        locked={locked}
        actions={props.folderActions}
        onScope={props.onScope}
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
          onSearchEverywhere={() => props.onScope(ALL_MEETINGS)}
        />
      </div>
      <ListFooter
        recording={recording}
        update={props.update}
        settingsOpen={props.settingsOpen}
        onToggleSettings={props.onToggleSettings}
        onNew={props.onNew}
        onShowRecording={props.onShowRecording}
      />
    </aside>
  );
}
