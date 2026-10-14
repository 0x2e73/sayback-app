import { Settings2 } from 'lucide-react';
import { timeLabel } from '../../../shared/format';
import { Button } from '../../components/ui';
import { useElapsed } from './use-elapsed';

interface Clock {
  readonly elapsed: number;
}

interface ListFooterProps {
  recording: Clock | null;
  settingsOpen: boolean;
  onToggleSettings(): void;
  onNew(): void;
  onShowRecording(): void;
}

function RecordingPill({ clock, onShow }: { clock: Clock; onShow(): void }) {
  const elapsed = useElapsed(clock);
  return (
    <Button variant="secondary" shape="pill" onClick={onShow}>
      <span className="live-dot" aria-hidden="true" />
      En cours · {timeLabel(elapsed)}
    </Button>
  );
}

// Settings stay shut while recording: the recording screen owns the two-hour stop.
export function ListFooter(props: ListFooterProps) {
  const { recording, settingsOpen, onToggleSettings, onNew, onShowRecording } = props;
  return (
    <div className="list-pane-footer">
      <Button
        variant="ghost"
        shape="round"
        aria-label="Paramètres"
        aria-pressed={settingsOpen}
        disabled={recording !== null}
        onClick={onToggleSettings}
      >
        <Settings2 size={16} aria-hidden="true" />
      </Button>
      {recording ? (
        <RecordingPill clock={recording} onShow={onShowRecording} />
      ) : (
        <Button shape="pill" onClick={onNew}>
          Démarrer l’enregistrement
        </Button>
      )}
    </div>
  );
}
