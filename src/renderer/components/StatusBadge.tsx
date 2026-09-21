import type { MeetingStatus } from '../../shared/contracts';

const statusLabels: Record<MeetingStatus, string> = {
  recording: 'Enregistrement',
  recorded: 'À analyser',
  processing: 'Analyse en cours',
  ready: 'Notes prêtes',
  error: 'À reprendre',
};

export function StatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
