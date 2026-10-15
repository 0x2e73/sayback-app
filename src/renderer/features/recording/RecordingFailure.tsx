import { Button, Notice } from '../../components/ui';

interface RecordingFailureProps {
  opening: boolean;
  onOpen(): void;
}

export function RecordingFailure({ opening, onOpen }: RecordingFailureProps) {
  const action = (
    <Button variant="secondary" busy={opening} onClick={onOpen}>
      Ouvrir la réunion
    </Button>
  );
  return (
    <Notice action={action}>
      L’enregistrement s’est interrompu. Ce qui a été capturé est conservé.
    </Notice>
  );
}
