import { useCallback } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import type { IslandRequest } from '../../shared/island';
import { Button } from '../components/ui';
import { useConfirmation } from './use-confirmation';

interface IslandOpenProps {
  expanded: boolean;
  chrono: string;
  paused: boolean;
  stopping: boolean;
  onRequest(request: IslandRequest): void;
}

function stateLabel(paused: boolean, stopping: boolean): string {
  if (stopping) return 'Arrêt en cours…';
  if (paused) return 'En pause';
  return 'Enregistrement';
}

// Laid out at its final size, revealed by the growing shell: never measured, never moved.
export function IslandOpen({ expanded, chrono, paused, stopping, onRequest }: IslandOpenProps) {
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
      <div className="island-stage">
        <div className="island-preview-slot" />
        <p className="island-live-slot">Le texte en direct arrive bientôt.</p>
      </div>
      <div className="island-actions">
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
      </div>
    </div>
  );
}
