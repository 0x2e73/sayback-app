export type SpeakerTone = 1 | 2 | 3 | 4;

interface SpeakerLabelProps {
  name: string;
  tone: SpeakerTone;
}

/** The 12/600 label and its dot in the speaker colour; shared with the live panel. */
export function SpeakerLabel({ name, tone }: SpeakerLabelProps) {
  return (
    <span className={`speaker-label speaker-tone-${tone}`}>
      <span className="speaker-dot" aria-hidden="true" />
      {name}
    </span>
  );
}
