import { useCallback, type ReactNode } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import type { IslandRequest } from '../../shared/island';
import { Button } from '../components/ui';
import { useConfirmation } from './use-confirmation';

interface IslandOpenProps {
  expanded: boolean;
  chrono: string;
  paused: boolean;
  stopping: boolean;
  /** The preview and the live text, or the screen picker in their place. */
  scene: ReactNode;
  /** « Changer d'écran », left of the actions. */
  switchControl: ReactNode;
  onRequest(request: IslandRequest): void;
}

function stateLabel(paused: boolean, stopping: boolean): string {
  if (stopping) return 'Arrêt en cours…';
  if (paused) return 'En pause';
  return 'Enregistrement';
}

// Laid out at its final size, revealed by the growing shell: never measured, never moved.
export function IslandOpen(props: IslandOpenProps) {
  const { expanded, chrono, paused, stopping, onRequest } = props;
  const stop = useCallback(() => onRequest('stop'), [onRequest]);
  // A stray click on a panel that appears under the cursor must not end the meeting.
  const confirmation = useConfirmation(stop, expanded);
  return (
    <div className="island-panel island-open" inert={!expanded} aria-hidden={!expanded}>
      <header className="island-open-header">
        <span className="island-state">
          <span className="island-dot" />
          {stateLabel(paused, stopping)}
        </span>
        <span className="island-chrono island-chrono-open" role="timer">
          {chrono}
        </span>
      </header>
      {props.scene}
      <div className="island-actions island-open-actions">
        {props.switchControl}
        <span className="island-actions-end">
          <Button
            variant="secondary"
            shape="pill"
            disabled={stopping}
            onClick={() => onRequest(paused ? 'resume' : 'pause')}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? 'Reprendre' : 'Pause'}
          </Button>
          <Button shape="pill" busy={stopping} onClick={confirmation.press}>
            <Square size={12} fill="currentColor" />
            {confirmation.armed ? 'Confirmer l’arrêt' : 'Terminer'}
          </Button>
        </span>
      </div>
    </div>
  );
}
