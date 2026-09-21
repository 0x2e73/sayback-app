import { useEffect, useState } from 'react';
import type { Meeting } from '../../../shared/contracts';

export function AnalysisProgress({ meeting }: { meeting: Meeting }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const total = meeting.audioChunks.length;
  const done = meeting.audioChunks.filter((chunk) => chunk.transcript !== null).length;
  const transcribing = done < total;
  const started = meeting.processingStartedAt
    ? Date.parse(meeting.processingStartedAt)
    : Number.NaN;
  const elapsed = Number.isFinite(started) ? Math.max(0, (now - started) / 1_000) : 0;
  const remaining = done > 0 ? Math.ceil((elapsed * (total - done)) / done / 60) : null;

  return (
    <div className="analysis-progress" role="status" aria-live="polite">
      <strong>{transcribing ? 'Transcription en cours' : 'Compte rendu en cours'}</strong>
      {transcribing ? (
        <>
          <progress value={done} max={Math.max(total, 1)} />
          <span>
            {done} segment{done > 1 ? 's' : ''} sur {total} transcrit{done > 1 ? 's' : ''}
          </span>
          <small>
            {remaining === null
              ? 'Estimation après les premiers segments.'
              : `Environ ${Math.max(1, remaining)} min encore pour la transcription, puis le compte rendu.`}
          </small>
        </>
      ) : (
        <small>
          La transcription est prête. La rédaction des notes peut prendre quelques minutes.
        </small>
      )}
    </div>
  );
}
