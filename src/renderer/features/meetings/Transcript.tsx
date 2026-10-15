import { useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { Presence } from '../../components/Presence';
import { usePlaybackSelector, type PlaybackClock } from './playback-clock';
import {
  activeTurnIndex,
  followedTurnIndex,
  partStarts,
  passageTurn,
  runningMaxEnd,
  transcriptRows,
} from './transcript-rows';
import { TranscriptList } from './TranscriptList';
import { TranscriptPills } from './TranscriptPills';
import { TranscriptSearchBar } from './TranscriptSearchBar';
import { TranscriptEmpty, TranscriptWaiting } from './TranscriptStates';
import type { TranscriptView } from './use-detail-view';
import { useStableTurns } from './use-stable-turns';
import {
  jumpTo,
  turnElement,
  useFollowReading,
  useReadingOutOfView,
  useSelectionIn,
} from './use-transcript-follow';
import { useTranscriptSearch } from './use-transcript-search';

interface TranscriptProps {
  meeting: Meeting;
  analyzing: boolean;
  clock: PlaybackClock;
  view: TranscriptView;
  onAnalyze(): void;
}

/**
 * Moves to the current search result when the reader asks for one (a settled query, a step),
 * never when a poll shifts it or when the tab opens on it.
 */
function useCurrentMatchInView(
  list: RefObject<HTMLDivElement | null>,
  reveal: string,
  onRelease: () => void,
): void {
  // Holding the previous value, not a "mounted" flag, keeps a double-run effect harmless.
  const previous = useRef(reveal);
  useLayoutEffect(() => {
    if (previous.current === reveal) return;
    previous.current = reveal;
    const mark = list.current?.querySelector('mark[aria-current="true"]');
    if (!mark) return;
    jumpTo(mark);
    // Going to a result is a move of the reader: the playback must not pull the view back.
    onRelease();
  }, [list, reveal, onRelease]);
}

function TranscriptReader({ meeting, analyzing, clock, view }: TranscriptProps) {
  const list = useRef<HTMLDivElement>(null);
  const turns = useStableTurns(meeting.transcript);
  const starts = useMemo(() => partStarts(meeting.audioChunks), [meeting.audioChunks]);
  const rows = useMemo(() => transcriptRows(turns, starts), [turns, starts]);
  const ends = useMemo(() => runningMaxEnd(turns), [turns]);
  const passage = useMemo(
    () => ({
      index: view.passage ? passageTurn(turns, view.passage) : -1,
      key: view.passage?.key ?? 0,
    }),
    [turns, view.passage],
  );
  const found = useTranscriptSearch(turns, view);
  const playing = useCallback((at: number) => activeTurnIndex(turns, at, ends), [turns, ends]);
  const followed = useCallback((at: number) => followedTurnIndex(turns, at, ends), [turns, ends]);
  // Each re-renders when its turn changes, not at every tick of the clock.
  const active = usePlaybackSelector(clock, playing);
  const reading = turns[usePlaybackSelector(clock, followed)]?.id ?? null;
  const selecting = useSelectionIn(list);
  useCurrentMatchInView(list, found.reveal, view.onRelease);
  useFollowReading(list, reading, view.following);
  const outOfView = useReadingOutOfView(view.scrollerRef, list, reading);

  function resume(): void {
    view.onFollow();
    jumpTo(turnElement(list.current, reading));
  }

  return (
    <div className="transcript">
      <TranscriptSearchBar found={found} />
      <TranscriptList
        ref={list}
        rows={rows}
        active={active}
        reading={reading}
        found={found}
        onSeek={view.onSeek}
        passage={passage}
      />
      {analyzing && <p className="caption">La transcription arrive au fur et à mesure.</p>}
      <TranscriptPills
        showFollow={(!view.following || selecting) && outOfView}
        onFollow={resume}
        showBack={view.passage !== null}
        onBack={view.onBackToNotes}
      />
    </div>
  );
}

type TranscriptState = 'reader' | 'waiting' | 'empty' | null;

function stateOf({ meeting, analyzing }: TranscriptProps): TranscriptState {
  if (meeting.transcript.length > 0) return 'reader';
  if (analyzing) return 'waiting';
  // A failed analysis speaks through the amber band above the tabs.
  if (meeting.status === 'error') return null;
  return 'empty';
}

/** Waiting, empty and loaded cross-fade: the one that leaves lies under the one that arrives. */
export function Transcript(props: TranscriptProps) {
  const state = stateOf(props);
  const { meeting, onAnalyze } = props;
  return (
    <div className="state-stack">
      <Presence open={state === 'waiting'}>
        {({ ref, state: phase }) => (
          <div ref={ref} className="state-view" data-state={phase}>
            <TranscriptWaiting />
          </div>
        )}
      </Presence>
      <Presence open={state === 'empty'}>
        {({ ref, state: phase }) => (
          <div ref={ref} className="state-view" data-state={phase}>
            <TranscriptEmpty canAnalyze={meeting.audioChunks.length > 0} onAnalyze={onAnalyze} />
          </div>
        )}
      </Presence>
      <Presence open={state === 'reader'}>
        {({ ref, state: phase }) => (
          <div ref={ref} className="state-view" data-state={phase}>
            <TranscriptReader {...props} />
          </div>
        )}
      </Presence>
    </div>
  );
}
