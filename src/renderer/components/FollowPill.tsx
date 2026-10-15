import { Button } from './Button';
import type { PresenceBinding } from './use-presence';

interface FollowPillProps {
  label: string;
  onClick(): void;
  /** From the owner's presence: the pill slides in and leaves in a fade. */
  presence?: PresenceBinding;
}

/** Floats over a reading column to bring the reader back: « Revenir au direct », « Retour aux notes ». */
export function FollowPill({ label, onClick, presence }: FollowPillProps) {
  return (
    <span
      ref={presence?.ref}
      className="follow-pill-slot"
      data-state={presence?.state}
      inert={presence?.state === 'closing'}
    >
      <Button variant="secondary" shape="pill" className="follow-pill" onClick={onClick}>
        {label}
      </Button>
    </span>
  );
}
