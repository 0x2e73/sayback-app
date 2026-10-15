import type { Ref } from 'react';
import { fromKeyboard } from './ScreenPicker';
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
    action: { label: 'Réessayer', request: 'refresh-screens' },
  },
  interrupted: {
    text: 'Un enregistrement interrompu attend dans SayBack.',
    action: { label: 'Ouvrir SayBack', request: 'open' },
  },
  failed: { text: 'L’enregistrement n’a pas démarré.' },
};

interface ReadyScreenLineProps {
  screen: IslandScreen | null;
  /** « Changer d'écran » is offered from two screens. */
  screenCount: number;
  /** The screen chip: off, the line stays as a reminder, dimmed. */
  screenOn: boolean;
  error: RecordingStartError | null;
  busy: boolean;
  onRequest(request: IslandRequest): void;
  /** `instantly`: opened from the keyboard. */
  onChange(instantly: boolean): void;
  changeRef: Ref<HTMLButtonElement>;
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
      <span className="sr-only" aria-live="polite">
        {screen && `${screen.name} sélectionné`}
      </span>
      {props.screenCount >= 2 && (
        <Button
          ref={props.changeRef}
          variant="ghost"
          className="island-line-action"
          disabled={props.busy || !screenOn}
          onClick={(event) => props.onChange(fromKeyboard(event))}
        >
          Changer d’écran
        </Button>
      )}
    </div>
  );
}
