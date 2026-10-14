import { timeLabel } from '../../../shared/format';
import { Download, Trash2 } from 'lucide-react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { Button, StatusBadge } from '../../components/ui';

interface MeetingHeaderProps {
  meeting: Meeting;
  folders: Folder[];
  busy: boolean;
  onMove(folderId: string | null): void;
  onExport(): void;
  onDelete(): void;
}

interface FolderSelectProps {
  meeting: Meeting;
  folders: Folder[];
  onMove(folderId: string | null): void;
}

// The keyboard way to file a meeting now that rows have no <select>; lot 5 restyles it.
function FolderSelect({ meeting, folders, onMove }: FolderSelectProps) {
  const settled = meeting.status !== 'recording' && meeting.status !== 'processing';
  return (
    <select
      className="detail-folder-select"
      aria-label="Dossier de la réunion"
      value={meeting.folderId ?? ''}
      disabled={!settled}
      onChange={(event) => onMove(event.target.value || null)}
    >
      <option value="">Sans dossier</option>
      {folders.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {folder.name}
        </option>
      ))}
    </select>
  );
}

const longDate = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'long', timeStyle: 'short' });

function createdLabel(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? 'Date inconnue' : longDate.format(date);
}

export function MeetingHeader({
  meeting,
  folders,
  busy,
  onMove,
  onExport,
  onDelete,
}: MeetingHeaderProps) {
  return (
    <div className="detail-heading">
      <div>
        <div className="row">
          <StatusBadge status={meeting.status} />
          <span className="caption">{timeLabel(meeting.duration)}</span>
          <FolderSelect meeting={meeting} folders={folders} onMove={onMove} />
        </div>
        <h1>{meeting.title}</h1>
        <p className="muted">{createdLabel(meeting.createdAt)}</p>
      </div>
      <div className="row">
        <Button variant="secondary" onClick={onExport} disabled={!meeting.transcript.length}>
          <Download size={16} />
          Exporter
        </Button>
        <Button
          variant="ghost"
          aria-label="Supprimer la réunion"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 size={17} />
        </Button>
      </div>
    </div>
  );
}
