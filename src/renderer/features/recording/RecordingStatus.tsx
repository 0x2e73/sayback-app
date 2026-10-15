export type RecordingPhase = 'recording' | 'paused' | 'stopping' | 'failed';

const LABELS: Record<RecordingPhase, string> = {
  recording: 'Enregistrement en cours',
  paused: 'En pause',
  stopping: 'Finalisation…',
  failed: 'Enregistrement interrompu',
};

interface RecordingStatusProps {
  phase: RecordingPhase;
}

export function RecordingStatus({ phase }: RecordingStatusProps) {
  return (
    <p className="recording-status" data-phase={phase}>
      <span className="recording-dot" aria-hidden="true" />
      {LABELS[phase]}
    </p>
  );
}
