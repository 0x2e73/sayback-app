import { useState } from 'react';
import { Search } from 'lucide-react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { EmptyLibrary } from './EmptyLibrary';
import { FolderBoard } from './FolderBoard';
import { MeetingRow } from './MeetingRow';

interface LibraryProps {
  meetings: Meeting[];
  folders: Folder[];
  onOpen(meeting: Meeting): void;
  onCreateFolder(name: string): Promise<Folder | null>;
  onRenameFolder(id: string, name: string): Promise<boolean>;
  onDeleteFolder(id: string): Promise<boolean>;
  onMoveMeeting(meetingId: string, folderId: string | null): Promise<boolean>;
}

function LibraryResults({
  meetings,
  results,
  query,
  folders,
  onOpen,
  onMove,
}: {
  meetings: Meeting[];
  results: Meeting[];
  query: string;
  folders: Folder[];
  onOpen: LibraryProps['onOpen'];
  onMove: LibraryProps['onMoveMeeting'];
}) {
  if (!meetings.length) return <EmptyLibrary />;
  if (!results.length)
    return (
      <div className="empty-search">
        {query ? 'Aucune réunion trouvée.' : 'Aucune réunion dans ce dossier.'}
      </div>
    );
  return (
    <div className="meeting-list">
      {results.map((meeting) => (
        <MeetingRow
          key={meeting.id}
          meeting={meeting}
          folders={folders}
          onOpen={onOpen}
          onMove={onMove}
        />
      ))}
    </div>
  );
}

export function Library(props: LibraryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [globalSearch, setGlobalSearch] = useState(false);
  const selectedFolder = props.folders.find((folder) => folder.id === selectedId);
  const scope =
    selectedFolder && !globalSearch
      ? props.meetings.filter((meeting) => meeting.folderId === selectedId)
      : props.meetings;
  const results = scope.filter((meeting) =>
    meeting.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <>
      <FolderBoard
        folders={props.folders}
        meetings={props.meetings}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={props.onCreateFolder}
        onRename={props.onRenameFolder}
        onDelete={async (id) => {
          const deleted = await props.onDeleteFolder(id);
          if (deleted && selectedId === id) setSelectedId(null);
          return deleted;
        }}
        onMove={props.onMoveMeeting}
      />
      <div className="library-toolbar">
        <div className="library-result-heading">
          <strong>{selectedFolder ? selectedFolder.name : 'Toutes les réunions'}</strong>
          <span className="count">{results.length}</span>
        </div>
        <div className="library-search-controls">
          {selectedFolder && (
            <label className="search-scope">
              <input
                type="checkbox"
                checked={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.checked)}
              />
              Chercher partout
            </label>
          )}
          <label className="search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Rechercher une réunion"
              placeholder="Rechercher une réunion…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </div>
      <LibraryResults
        meetings={props.meetings}
        results={results}
        query={query}
        folders={props.folders}
        onOpen={props.onOpen}
        onMove={props.onMoveMeeting}
      />
    </>
  );
}
