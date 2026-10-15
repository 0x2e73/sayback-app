import { Presence } from '../../components/Presence';
import { FollowPill } from '../../components/ui';

interface TranscriptPillsProps {
  showFollow: boolean;
  onFollow(): void;
  showBack: boolean;
  onBack(): void;
}

/** Sticks to the bottom of the card above the player bar; empty, it takes no room. */
export function TranscriptPills({ showFollow, onFollow, showBack, onBack }: TranscriptPillsProps) {
  return (
    <div className="transcript-pills">
      <Presence open={showBack}>
        {(presence) => <FollowPill label="Retour aux notes" onClick={onBack} presence={presence} />}
      </Presence>
      <Presence open={showFollow}>
        {(presence) => (
          <FollowPill label="Revenir au direct" onClick={onFollow} presence={presence} />
        )}
      </Presence>
    </div>
  );
}
