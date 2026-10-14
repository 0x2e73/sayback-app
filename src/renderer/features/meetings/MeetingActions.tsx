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

/** Why an action is unavailable, or null when it is available. */
function holdBack(busy: boolean, ready: boolean, missing: string): string | null {
  if (busy) return 'Disponible à la fin de l’analyse.';
  return ready ? null : missing;
}

export function MeetingActions({ meeting, busy, onDelete }: MeetingActionsProps) {
  const copy = useCopyNotes(meeting);
  const hasNotes = meeting.notes !== null || meeting.clarifications.length > 0;
  const copyHint = holdBack(busy, hasNotes, 'Aucune note à copier pour le moment.');
  const exportHint = holdBack(
    busy,
    meeting.transcript.length > 0,
    'Aucune transcription à exporter pour le moment.',
  );

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
          title={copyHint ?? 'Copier les notes'}
          disabled={copyHint !== null}
          onClick={() => void copy.copy()}
        >
          <Copy size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          shape="round"
          aria-label="Exporter"
          title={exportHint ?? 'Exporter'}
          disabled={exportHint !== null}
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
