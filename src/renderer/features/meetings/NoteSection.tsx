import type { Meeting, NoteItem } from '../../../shared/contracts';
import type { TimestampHandler } from './Clarifications';
import { shortTimeLabel } from './detail-format';
import { noteSources } from './meeting-format';

interface NoteSectionProps {
  title: string;
  items: NoteItem[];
  meeting: Meeting;
  onTimestamp: TimestampHandler;
}

export function NoteSection({ title, items, meeting, onTimestamp }: NoteSectionProps) {
  if (!items.length) return null;

  return (
    <section className="note-section">
      <h2>{title}</h2>
      <ul className="note-list">
        {items.map((item, index) => (
          <li key={index}>
            <span className="note-text">{item.text}</span>
            {noteSources(meeting, item.sourceIds).map((source) => (
              <button
                key={source.id}
                type="button"
                className="timestamp-link"
                aria-label={`Écouter à ${shortTimeLabel(source.at)}`}
                onClick={() => onTimestamp(source.at, source.id)}
              >
                {shortTimeLabel(source.at)}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
