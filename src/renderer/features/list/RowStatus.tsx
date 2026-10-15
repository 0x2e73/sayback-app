import type { Meeting } from '../../../shared/contracts';
import { statusLabels } from '../../components/StatusBadge';
import { useChanged } from '../../components/use-changed';
import { analysisRatio } from '../meetings/analysis-progress';

export function RowStatus({ meeting }: { meeting: Meeting }) {
  // A status that changes under the eye fades in; the ones present at mount do not.
  const changed = useChanged(meeting.status) || undefined;
  if (meeting.status === 'ready') {
    const summary = meeting.notes?.summary.trim();
    if (!summary) return null;
    return (
      <span className="meeting-row-summary" data-changed={changed}>
        {summary}
      </span>
    );
  }
  return (
    <span
      key={meeting.status}
      className={`row-status row-status-${meeting.status}`}
      data-changed={changed}
    >
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
