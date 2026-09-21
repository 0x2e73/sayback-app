import { ArrowUpRight, AudioLines, Plus } from 'lucide-react';
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
        <div>
          <p className="eyebrow">Moins de notes. Plus de présence.</p>
          <h1>
            Mes réunions<span className="heading-dot">.</span>
          </h1>
          <p>Les conversations passent. Les bonnes idées restent.</p>
        </div>
        <Button onClick={onNew}>
          <Plus size={17} />
          Nouvelle réunion
        </Button>
      </div>
      <div className="intro-strip">
        <span className="intro-icon">
          <AudioLines size={22} />
        </span>
        <div>
          <strong>Gardez toute la conversation.</strong>
          <span>L’audio, l’écran et les idées importantes, au même endroit.</span>
        </div>
        <ArrowUpRight size={18} />
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
