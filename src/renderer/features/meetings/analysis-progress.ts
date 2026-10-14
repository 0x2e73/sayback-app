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
