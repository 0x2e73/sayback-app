import type { Meeting } from '../../../shared/contracts';
import { useCurrentDate } from '../list/use-current-date';
import { analysisLabel, analysisRatio, remainingLabel } from './analysis-progress';

/** The status slot of the meta line while the analysis runs; only the progress is announced. */
export function AnalysisStatus({ meeting }: { meeting: Meeting }) {
  const now = useCurrentDate(5_000);
  const remaining = remainingLabel(meeting, now.getTime());
  return (
    <span className="analysis-status">
      <span role="status">{analysisLabel(meeting)}</span>
      {remaining && <span> · {remaining}</span>}
    </span>
  );
}

/** 2 px across the top of the card, positioned against .main-card: nothing below moves. */
export function AnalysisLine({ meeting }: { meeting: Meeting }) {
  return (
    <span className="analysis-line" aria-hidden="true">
      <span
        className="analysis-line-bar"
        style={{ transform: `scaleX(${analysisRatio(meeting)})` }}
      />
    </span>
  );
}
