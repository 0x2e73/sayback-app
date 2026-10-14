import { useState } from 'react';
import { timeLabel } from '../../../shared/format';
import { ArrowUpRight, Clock3, FileText, GripVertical } from 'lucide-react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { StatusBadge } from '../../components/ui';
import { MEETING_DRAG_TYPE } from '../list/useFolderDrop';

interface MeetingRowProps {
  meeting: Meeting;
  folders: Folder[];
  onOpen(meeting: Meeting): void;
  onMove(meetingId: string, folderId: string | null): Promise<boolean>;
}

export function MeetingRow({ meeting, folders, onOpen, onMove }: MeetingRowProps) {
  const date = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(meeting.createdAt),
  );
  const movingDisabled = meeting.status === 'recording' || meeting.status === 'processing';
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`meeting-row${dragging ? ' is-dragging' : ''}`}
      draggable={!movingDisabled}
      onDragStart={(event) => {
        event.dataTransfer.setData(MEETING_DRAG_TYPE, meeting.id);
        event.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <GripVertical size={17} className="row-grip" aria-hidden="true" />
      <button type="button" className="meeting-row-open" onClick={() => onOpen(meeting)}>
        <span className="meeting-icon">
          <FileText size={21} />
        </span>
        <span className="meeting-row-main">
          <strong>{meeting.title}</strong>
          <span className="meeting-row-meta">
            <span>{date}</span>
            <span className="dot-separator">·</span>
            <Clock3 size={12} />
            <span>{timeLabel(meeting.duration)}</span>
          </span>
        </span>
        <StatusBadge status={meeting.status} />
        <ArrowUpRight size={17} className="row-arrow" />
      </button>
      <select
        className="meeting-folder-select"
        aria-label={`Dossier de ${meeting.title}`}
        value={meeting.folderId ?? ''}
        disabled={movingDisabled}
        onChange={(event) => void onMove(meeting.id, event.target.value || null)}
      >
        <option value="">Sans dossier</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
    </div>
  );
}
