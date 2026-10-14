import type { Meeting } from '../../../shared/contracts';
import { statusLabels } from '../../components/StatusBadge';

// Chunks report their transcription; the notes phase shows a full line.
function analysisRatio(meeting: Meeting): number {
  const total = meeting.audioChunks.length;
  if (total === 0) return 0;
  return meeting.audioChunks.filter((chunk) => chunk.transcript !== null).length / total;
}

export function RowStatus({ meeting }: { meeting: Meeting }) {
  if (meeting.status === 'ready') {
    const summary = meeting.notes?.summary.trim();
    if (!summary) return null;
    return <span className="meeting-row-summary">{summary}</span>;
  }
  return (
    <span className={`row-status row-status-${meeting.status}`}>
      <span className="row-status-label">
        <span className="row-status-dot" aria-hidden="true" />
        {statusLabels[meeting.status]}
      </span>
      {meeting.status === 'processing' && (
        <span className="row-progress" aria-hidden="true">
          <span
            className="row-progress-bar"
            style={{ transform: `scaleX(${analysisRatio(meeting)})` }}
          />
        </span>
      )}
    </span>
  );
}
