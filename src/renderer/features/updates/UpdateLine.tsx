import type { UpdateStatus } from '../../../shared/contracts';
import { Button } from '../../components/ui';
import { updateLabel } from './update-label';

export interface UpdateLineProps {
  status: UpdateStatus | null;
  busy: boolean;
  onInstall(): void;
}

function UpdateContent({ status, busy, onInstall }: UpdateLineProps) {
  if (!status?.available) return null;
  if (!status.canInstall && !status.reason) return null;
  return (
    <div className="update-line">
      <div className="update-line-text">
        <strong>Mise à jour prête</strong>
        <span className="update-line-version">{updateLabel(status.available)}</span>
        {!status.canInstall && <span className="update-line-reason">{status.reason}</span>}
      </div>
      {status.canInstall && (
        <Button variant="secondary" busy={busy} onClick={onInstall}>
          Installer
        </Button>
      )}
    </div>
  );
}

// The live region stays mounted, empty and without size, so a screen reader announces its arrival.
export function UpdateLine(props: UpdateLineProps) {
  return (
    <div role="status" aria-label="Mise à jour">
      <UpdateContent {...props} />
    </div>
  );
}
