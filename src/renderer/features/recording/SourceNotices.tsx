import { Presence } from '../../components/Presence';
import { Button, Notice } from '../../components/ui';

interface SourceNoticesProps {
  screenBlocked: boolean;
  microphoneBlocked: boolean;
  noAudio: boolean;
  onOpenSettings(kind: 'screen' | 'microphone'): void;
  onWithoutScreen(): void;
}

export function SourceNotices(props: SourceNoticesProps) {
  const { screenBlocked, microphoneBlocked, noAudio } = props;
  return (
    <>
      <Presence open={screenBlocked}>
        {(presence) => (
          <Notice
            presence={presence}
            action={
              <>
                <Button variant="secondary" onClick={() => props.onOpenSettings('screen')}>
                  Ouvrir les réglages macOS
                </Button>
                <Button variant="ghost" onClick={props.onWithoutScreen}>
                  Continuer sans écran
                </Button>
              </>
            }
          >
            SayBack n’a pas l’autorisation d’enregistrer l’écran.
          </Notice>
        )}
      </Presence>
      <Presence open={microphoneBlocked}>
        {(presence) => (
          <Notice
            tone="warning"
            presence={presence}
            action={
              <Button variant="secondary" onClick={() => props.onOpenSettings('microphone')}>
                Ouvrir les réglages
              </Button>
            }
          >
            Le microphone est bloqué dans les réglages macOS.
          </Notice>
        )}
      </Presence>
      <Presence open={noAudio}>
        {(presence) => (
          <Notice tone="warning" presence={presence}>
            Activez le microphone ou le son du système.
          </Notice>
        )}
      </Presence>
    </>
  );
}
