import { timeLabel } from '../../../shared/format';
import { Download, Trash2 } from 'lucide-react';
import type { Meeting } from '../../../shared/contracts';
import { Button, StatusBadge } from '../../components/ui';

interface MeetingHeaderProps {
  meeting: Meeting;
  busy: boolean;
  onExport(): void;
  onDelete(): void;
}

export function MeetingHeader({ meeting, busy, onExport, onDelete }: MeetingHeaderProps) {
  const createdAt = new Intl.DateTimeFormat('fr-CH', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(meeting.createdAt));

  return (
    <div className="detail-heading">
      <div>
        <div className="row">
          <StatusBadge status={meeting.status} />
          <span className="caption">{timeLabel(meeting.duration)}</span>
        </div>
        <h1>{meeting.title}</h1>
        <p className="muted">{createdAt}</p>
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
