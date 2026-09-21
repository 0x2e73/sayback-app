import { useState } from 'react';
import { FileText, ListChecks } from 'lucide-react';
import type { Meeting } from '../../../shared/contracts';
import { MeetingNotes } from './MeetingNotes';
import { Transcript } from './Transcript';
import { AnalysisProgress } from './AnalysisProgress';

interface MeetingContentProps {
  meeting: Meeting;
  at: number;
  analyzing: boolean;
  onAnalyze(): void;
  onSettings(): void;
  onSeek(at: number): void;
}

export function MeetingContent(props: MeetingContentProps) {
  const [tab, setTab] = useState<'notes' | 'transcript'>('notes');

  return (
    <section className="notes-panel">
      <div className="tabs" role="tablist" aria-label="Contenu de la réunion">
        <button role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>
          <ListChecks size={16} />
          Compte rendu
        </button>
        <button
          role="tab"
          aria-selected={tab === 'transcript'}
          onClick={() => setTab('transcript')}
        >
          <FileText size={16} />
          Transcription
        </button>
      </div>
      {props.analyzing && <AnalysisProgress meeting={props.meeting} />}
      {tab === 'notes' ? (
        <MeetingNotes {...props} />
      ) : (
        <Transcript meeting={props.meeting} at={props.at} onSeek={props.onSeek} />
      )}
    </section>
  );
}
