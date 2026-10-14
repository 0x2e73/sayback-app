import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Segmented, tabId, type SegmentedOption } from '../../components/ui';
import type { TranscriptSearch } from './Transcript';
import { useTabScroll } from './use-tab-scroll';

type DetailTab = 'notes' | 'transcript';

const NOTES_PANEL = 'meeting-notes';
const TRANSCRIPT_PANEL = 'meeting-transcript';
const tabs: readonly SegmentedOption<DetailTab>[] = [
  { value: 'notes', label: 'Notes', panelId: NOTES_PANEL },
  { value: 'transcript', label: 'Transcription', panelId: TRANSCRIPT_PANEL },
];

interface MeetingContentProps {
  header: ReactNode;
  notes: ReactNode;
  transcript(search: TranscriptSearch): ReactNode;
}

interface DetailPanelProps {
  id: string;
  active: boolean;
  /** Stays mounted while hidden: the clarification draft must survive a tab change. */
  keepMounted?: boolean;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Both panels exist for aria-controls; the transcript only renders while it is shown.
function DetailPanel({ id, active, keepMounted = false, children }: DetailPanelProps) {
  const panel = useRef<HTMLDivElement>(null);

  // A panel with nothing to focus is itself reachable, so the keyboard can scroll it.
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    if (element.querySelector(FOCUSABLE)) element.removeAttribute('tabindex');
    else element.setAttribute('tabindex', '0');
  });

  return (
    <div
      ref={panel}
      role="tabpanel"
      id={id}
      aria-labelledby={tabId(id)}
      hidden={!active}
      className="detail-panel"
    >
      {(active || keepMounted) && children}
    </div>
  );
}

/** The one scroll of the card: the header scrolls away, the tab bar sticks, each tab keeps its place. */
export function MeetingContent({ header, notes, transcript }: MeetingContentProps) {
  const { tab, select, scrollerRef, anchorRef } = useTabScroll<DetailTab>('notes');
  const [search, setSearch] = useState('');
  return (
    <div className="detail-scroll" ref={scrollerRef}>
      <div className="detail-column">
        {header}
        <div ref={anchorRef} />
        <div className="detail-tabs">
          <Segmented label="Contenu de la réunion" options={tabs} value={tab} onChange={select} />
        </div>
        <DetailPanel id={NOTES_PANEL} active={tab === 'notes'} keepMounted>
          {notes}
        </DetailPanel>
        <DetailPanel id={TRANSCRIPT_PANEL} active={tab === 'transcript'}>
          {transcript({ search, onSearch: setSearch })}
        </DetailPanel>
      </div>
    </div>
  );
}
