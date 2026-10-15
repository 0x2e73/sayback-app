import { Monitor, TriangleAlert } from 'lucide-react';
import { Button } from '../components/ui';

interface ScreenSwitchControlProps {
  /** A screen is captured and another one exists. */
  offered: boolean;
  open: boolean;
  failed: boolean;
  disabled: boolean;
  onToggle(): void;
}

/** Left of the recording actions: « Changer d'écran », or for 4 s why it did not. */
export function ScreenSwitchControl(props: ScreenSwitchControlProps) {
  if (!props.offered) return <span />;
  return (
    <span className="island-switch" aria-live="polite">
      {props.failed ? (
        <span className="island-switch-failed">
          <TriangleAlert size={12} aria-hidden="true" />
          Changement impossible
        </span>
      ) : (
        <Button
          variant="ghost"
          className="island-ghost"
          aria-pressed={props.open}
          disabled={props.disabled}
          onClick={props.onToggle}
        >
          <Monitor size={14} aria-hidden="true" />
          Changer d’écran
        </Button>
      )}
    </span>
  );
}
