import { timeLabel } from '../../../shared/format';
import { Play } from 'lucide-react';
import type { Meeting, NoteItem } from '../../../shared/contracts';

import { sourceTime } from './meeting-format';

interface NoteSectionProps {
  title: string;
  items: NoteItem[];
  meeting: Meeting;
  onSeek(at: number): void;
}

export function NoteSection({ title, items, meeting, onSeek }: NoteSectionProps) {
  if (!items.length) return null;

  return (
    <section className="note-section">
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={index}>
            <span>{item.text}</span>
            <span className="source-links">
              {item.sourceIds.slice(0, 3).map((id) => {
                const at = sourceTime(meeting, id);
                if (at === undefined) return null;
                return (
                  <button className="timestamp-link" key={id} onClick={() => onSeek(at)}>
                    <Play size={10} />
                    {timeLabel(at)}
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
