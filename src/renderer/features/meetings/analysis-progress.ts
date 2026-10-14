import type { Meeting } from '../../../shared/contracts';

export interface AnalysisProgress {
  done: number;
  total: number;
}

type Chunked = Pick<Meeting, 'audioChunks'>;

export function analysisProgress(meeting: Chunked): AnalysisProgress {
  const total = meeting.audioChunks.length;
  const done = meeting.audioChunks.filter((chunk) => chunk.transcript !== null).length;
  return { done, total };
}

// Chunks report their transcription; the notes phase shows a full line.
export function analysisRatio(meeting: Chunked): number {
  const { done, total } = analysisProgress(meeting);
  return total === 0 ? 0 : done / total;
}

export function analysisLabel(meeting: Chunked): string {
  const { done, total } = analysisProgress(meeting);
  if (total === 0) return 'Analyse en cours';
  if (done >= total) return 'Analyse en cours · rédaction du compte rendu';
  return `Analyse en cours · ${done} segment${done > 1 ? 's' : ''} sur ${total}`;
}

/** Measured pace of the segments done so far; nothing before the first one. */
export function remainingLabel(
  meeting: Pick<Meeting, 'audioChunks' | 'processingStartedAt'>,
  now: number,
): string | null {
  const { done, total } = analysisProgress(meeting);
  if (done === 0 || done >= total) return null;
  const started = meeting.processingStartedAt
    ? Date.parse(meeting.processingStartedAt)
    : Number.NaN;
  if (!Number.isFinite(started)) return null;
  const elapsed = Math.max(0, (now - started) / 1_000);
  const minutes = Math.max(1, Math.ceil((elapsed * (total - done)) / done / 60));
  return `environ ${minutes} min`;
}
