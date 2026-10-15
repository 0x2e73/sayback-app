import { useEffect, useState } from 'react';
import { Presence } from '../../components/Presence';
import type { Meeting } from '../../../shared/contracts';
import { useCurrentDate } from '../list/use-current-date';
import { PaceTracker, remainingLabel } from './analysis-pace';
import { analysisLabel, analysisProgress, analysisRatio } from './analysis-progress';

/** The status slot of the meta line while the analysis runs; only the progress is announced. */
export function AnalysisStatus({ meeting }: { meeting: Meeting }) {
  const now = useCurrentDate(5_000);
  const [pace] = useState(() => new PaceTracker());
  const { done, total } = analysisProgress(meeting);
  // Watching starts here: what was already done on arrival gives no pace.
  useEffect(() => pace.observe(done, Date.now()), [pace, done]);
  const seconds = pace.remaining(total, meeting.duration, now.getTime());
  return (
    <span className="analysis-status">
      <span role="status">{analysisLabel(meeting)}</span>
      {seconds !== null && <span> · {remainingLabel(seconds)}</span>}
    </span>
  );
}

/**
 * 2 px across the top of the card, positioned against .main-card: nothing below moves.
 * When the analysis ends the bar fills, then the line fades.
 */
export function AnalysisLine({ meeting, open }: { meeting: Meeting; open: boolean }) {
  return (
    <Presence open={open}>
      {({ ref, state }) => (
        <span ref={ref} className="analysis-line" data-state={state} aria-hidden="true">
          <span
            className="analysis-line-bar"
            style={{ transform: `scaleX(${open ? analysisRatio(meeting) : 1})` }}
          />
        </span>
      )}
    </Presence>
  );
}
