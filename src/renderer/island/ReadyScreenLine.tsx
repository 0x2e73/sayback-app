import { Monitor, TriangleAlert } from 'lucide-react';
import type { IslandRequest, IslandScreen } from '../../shared/island';
import type { RecordingStartError } from '../../shared/recording-start';
import { Button } from '../components/ui';

interface ErrorCopy {
  text: string;
  action?: { label: string; request: IslandRequest };
}

const ERRORS: Record<RecordingStartError, ErrorCopy> = {
  'screen-denied': {
    text: 'Autorisation d’écran refusée.',
    action: { label: 'Ouvrir les réglages', request: 'open-privacy-settings' },
  },
  'no-audio-source': { text: 'Activez le microphone ou le son du système.' },
  'no-screen': {
    text: 'Aucun écran détecté.',
    action: { label: 'Réessayer', request: 'cycle-screen' },
  },
  failed: { text: 'L’enregistrement n’a pas démarré.' },
};

interface ReadyScreenLineProps {
  screen: IslandScreen | null;
  screenCount: number;
  /** The screen chip: off, the line stays as a reminder, dimmed. */
  screenOn: boolean;
  error: RecordingStartError | null;
  busy: boolean;
  onRequest(request: IslandRequest): void;
}

interface ReadyErrorLineProps {
  error: RecordingStartError;
  onRequest(request: IslandRequest): void;
}

function ReadyErrorLine({ error, onRequest }: ReadyErrorLineProps) {
  const { text, action } = ERRORS[error];
  return (
    <div className="island-line" role="alert">
      <span className="island-line-label">
        <TriangleAlert size={14} className="island-line-warning" aria-hidden="true" />
        {text}
      </span>
      {action && (
        <Button
          variant="ghost"
          className="island-line-action"
          onClick={() => onRequest(action.request)}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

/** The screen to share, or the error that replaces it at the same height. */
export function ReadyScreenLine(props: ReadyScreenLineProps) {
  const { screen, screenOn, error, onRequest } = props;
  if (error) return <ReadyErrorLine error={error} onRequest={onRequest} />;
  return (
    <div className="island-line" data-off={!screenOn || undefined}>
      <span className="island-line-label">
        <Monitor size={14} aria-hidden="true" />
        {screen?.name}
      </span>
      {props.screenCount >= 2 && (
        <Button
          variant="ghost"
          className="island-line-action"
          disabled={props.busy || !screenOn}
          onClick={() => onRequest('cycle-screen')}
        >
          Changer
        </Button>
      )}
    </div>
  );
}
