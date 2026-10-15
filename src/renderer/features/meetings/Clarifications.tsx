import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { Meeting } from '../../../shared/contracts';
import { Button } from '../../components/ui';
import { ClarificationForm } from './ClarificationForm';
import { shortTimeLabel } from './detail-format';

/** A timestamp hands over its time and its source id; lot 6 uses the id to reach the turn. */
export type TimestampHandler = (at: number, sourceId: string) => void;

interface ClarificationsProps {
  meeting: Meeting;
  at: number;
  disabled: boolean;
  saving: boolean;
  submitError: string;
  onTimestamp: TimestampHandler;
  onSubmit(at: number, text: string): Promise<boolean>;
}

export function Clarifications(props: ClarificationsProps) {
  const { meeting, at, disabled, saving, submitError, onTimestamp, onSubmit } = props;
  const [open, setOpen] = useState(false);
  // Precisions saved while the notes are open enter and flash; the ones already there do not.
  const [initial] = useState(() => new Set(meeting.clarifications.map((item) => item.id)));

  return (
    <section className="note-section">
      <h2>Précisions</h2>
      {meeting.clarifications.length > 0 && (
        <ul className="note-list">
          {meeting.clarifications.map((item) => (
            <li key={item.id} data-new={!initial.has(item.id) || undefined}>
              <span className="note-text">{item.text}</span>
              <button
                type="button"
                className="timestamp-link"
                aria-label={`Écouter à ${shortTimeLabel(item.at)}`}
                onClick={() => onTimestamp(item.at, `clarification:${item.id}`)}
              >
                {shortTimeLabel(item.at)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <ClarificationForm
          duration={meeting.duration}
          at={at}
          saving={saving}
          submitError={submitError}
          onClose={() => setOpen(false)}
          onSubmit={onSubmit}
        />
      ) : (
        <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
          <MessageSquarePlus size={16} aria-hidden="true" />
          Ajouter une précision
        </Button>
      )}
    </section>
  );
}
