import { Plus } from 'lucide-react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { Button } from '../../components/ui';
import { Library } from './Library';

interface LibraryPageProps {
  meetings: Meeting[];
  folders: Folder[];
  loading: boolean;
  onNew(): void;
  onOpen(meeting: Meeting): void;
  onCreateFolder(name: string): Promise<Folder | null>;
  onRenameFolder(id: string, name: string): Promise<boolean>;
  onDeleteFolder(id: string): Promise<boolean>;
  onMoveMeeting(meetingId: string, folderId: string | null): Promise<boolean>;
}

export function LibraryPage({
  meetings,
  folders,
  loading,
  onNew,
  onOpen,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveMeeting,
}: LibraryPageProps) {
  return (
    <div className="library-page">
      <div className="page-heading">
        <h1>Mes réunions</h1>
        <Button onClick={onNew}>
          <Plus size={17} />
          Nouvelle réunion
        </Button>
      </div>
      {loading ? (
        <p className="muted" role="status">
          Chargement des réunions…
        </p>
      ) : (
        <Library
          meetings={meetings}
          folders={folders}
          onOpen={onOpen}
          onCreateFolder={onCreateFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onMoveMeeting={onMoveMeeting}
        />
      )}
    </div>
  );
}
