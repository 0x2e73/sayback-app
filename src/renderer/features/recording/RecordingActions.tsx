import { Pause, Play, Square } from 'lucide-react';
import { Button } from '../../components/ui';

interface RecordingActionsProps {
  paused: boolean;
  stopping: boolean;
  onTogglePause(): void;
  onStop(): void;
}

export function RecordingActions({
  paused,
  stopping,
  onTogglePause,
  onStop,
}: RecordingActionsProps) {
  return (
    <div className="recording-actions">
      <Button variant="secondary" shape="pill" disabled={stopping} onClick={onTogglePause}>
        {paused ? <Play size={16} /> : <Pause size={16} />}
        {paused ? 'Reprendre' : 'Pause'}
      </Button>
      <Button shape="pill" onClick={onStop} busy={stopping}>
        <Square size={14} fill="currentColor" />
        Terminer la réunion
      </Button>
    </div>
  );
}
