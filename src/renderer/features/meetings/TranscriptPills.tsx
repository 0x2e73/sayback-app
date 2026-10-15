import { FollowPill } from '../../components/ui';

interface TranscriptPillsProps {
  showFollow: boolean;
  onFollow(): void;
  showBack: boolean;
  onBack(): void;
}

/** Sticks to the bottom of the card above the player bar. */
export function TranscriptPills({ showFollow, onFollow, showBack, onBack }: TranscriptPillsProps) {
  if (!showFollow && !showBack) return null;
  return (
    <div className="transcript-pills">
      {showBack && <FollowPill label="Retour aux notes" onClick={onBack} />}
      {showFollow && <FollowPill label="Revenir au direct" onClick={onFollow} />}
    </div>
  );
}
