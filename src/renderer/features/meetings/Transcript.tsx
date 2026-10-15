import { useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { usePlaybackSelector, type PlaybackClock } from './playback-clock';
import { activeTurnIndex, partStarts, transcriptRows } from './transcript-rows';
import { TranscriptList } from './TranscriptList';
import { TranscriptSearchBar } from './TranscriptSearchBar';
import { TranscriptEmpty, TranscriptWaiting } from './TranscriptStates';
import type { TranscriptView } from './use-detail-view';
import { useStableTurns } from './use-stable-turns';
import { useTranscriptSearch } from './use-transcript-search';

interface TranscriptProps {
  meeting: Meeting;
  analyzing: boolean;
  clock: PlaybackClock;
  view: TranscriptView;
  onAnalyze(): void;
}

/** Moves to the current search result when it changes, not when the tab opens on it. */
function useCurrentMatchInView(list: RefObject<HTMLDivElement | null>, key: string | null): void {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (key === null) return;
    list.current?.querySelector('mark[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [list, key]);
}

function TranscriptReader({ meeting, analyzing, clock, view }: TranscriptProps) {
  const list = useRef<HTMLDivElement>(null);
  const turns = useStableTurns(meeting.transcript);
  const starts = useMemo(() => partStarts(meeting.audioChunks), [meeting.audioChunks]);
  const rows = useMemo(() => transcriptRows(turns, starts), [turns, starts]);
  const found = useTranscriptSearch(turns, view.search, view.onSearch);
  const playing = useCallback((at: number) => activeTurnIndex(turns, at), [turns]);
  // Re-renders when the active turn changes, not at every tick of the clock.
  const active = usePlaybackSelector(clock, playing);
  useCurrentMatchInView(list, found.currentKey);

  return (
    <div className="transcript">
      <TranscriptSearchBar found={found} />
      <TranscriptList ref={list} rows={rows} active={active} found={found} onSeek={view.onSeek} />
      {analyzing && <p className="caption">La transcription arrive au fur et à mesure.</p>}
    </div>
  );
}

export function Transcript(props: TranscriptProps) {
  const { meeting, analyzing, onAnalyze } = props;
  if (meeting.transcript.length > 0) return <TranscriptReader {...props} />;
  if (analyzing) return <TranscriptWaiting />;
  // A failed analysis speaks through the amber band above the tabs.
  if (meeting.status === 'error') return null;
  return <TranscriptEmpty canAnalyze={meeting.audioChunks.length > 0} onAnalyze={onAnalyze} />;
}
