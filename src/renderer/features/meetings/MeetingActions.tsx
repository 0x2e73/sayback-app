import { Copy, Download, Trash2 } from 'lucide-react';
import type { Meeting } from '../../../shared/contracts';
import { Button } from '../../components/ui';
import { downloadMeeting } from './download-meeting';
import { useCopyNotes } from './use-copy-notes';

interface MeetingActionsProps {
  meeting: Meeting;
  /** An analysis runs: the backend refuses the deletion (meeting-rules.ts:15-19). */
  busy: boolean;
  onDelete(): void;
}

export function MeetingActions({ meeting, busy, onDelete }: MeetingActionsProps) {
  const copy = useCopyNotes(meeting);
  const hasNotes = meeting.notes !== null || meeting.clarifications.length > 0;

  return (
    <div className="meeting-actions">
      <span className="action-feedback" role="status">
        {copy.message}
      </span>
      <div className="action-pill" role="group" aria-label="Actions de la réunion">
        <Button
          variant="ghost"
          shape="round"
          aria-label="Copier les notes"
          title="Copier les notes"
          disabled={!hasNotes}
          onClick={() => void copy.copy()}
        >
          <Copy size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          shape="round"
          aria-label="Exporter"
          title="Exporter"
          disabled={!meeting.transcript.length}
          onClick={() => downloadMeeting(meeting)}
        >
          <Download size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          shape="round"
          aria-label="Supprimer la réunion"
          title="Supprimer la réunion"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
