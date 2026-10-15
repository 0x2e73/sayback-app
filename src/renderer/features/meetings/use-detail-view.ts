import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { TimestampHandler } from './Clarifications';
import { useFollowPlayback } from './use-follow-playback';
import { useTabScroll } from './use-tab-scroll';
import { jumpTo, readingTurn } from './use-transcript-follow';

export type DetailTab = 'notes' | 'transcript';

export interface Passage {
  sourceId: string;
  at: number;
  /** Grows at each note click, so the same passage flashes again. */
  key: number;
}

export interface TranscriptView {
  search: string;
  /** Changing the search forgets the match chosen in the previous one. */
  onSearch(value: string): void;
  /** The key of the match the reader stepped to; kept across a change of tab. */
  match: string | null;
  onMatch(key: string | null): void;
  following: boolean;
  onFollow(): void;
  onRelease(): void;
  scrollerRef: RefObject<HTMLDivElement | null>;
  passage: Passage | null;
  onBackToNotes(): void;
  onSeek(at: number): void;
}

export interface DetailView {
  tab: DetailTab;
  selectTab(next: DetailTab): void;
  scrollerRef: RefObject<HTMLDivElement | null>;
  anchorRef: RefObject<HTMLDivElement | null>;
  openPassage: TimestampHandler;
  transcript: TranscriptView;
}

/** Where reading resumes when the transcript opens: the passage asked for, else the turn playing. */
export function placeReading(scroller: HTMLElement): void {
  const passage = scroller.querySelector('[data-passage]');
  if (passage) jumpTo(passage);
  else readingTurn(scroller)?.scrollIntoView({ block: 'nearest' });
}

/** The tabs, the transcript search, the follow and the note passage outlive a change of tab. */
export function useDetailView(playAt: (at: number) => void): DetailView {
  const [search, setSearch] = useState('');
  const [match, setMatch] = useState<string | null>(null);
  const [passage, setPassage] = useState<Passage | null>(null);
  const passages = useRef(0);
  // Read by the tab callback, which is declared before the follow it depends on.
  const followingNow = useRef(true);
  const tabs = useTabScroll<DetailTab>('notes', (tab, scroller) => {
    if (tab === 'transcript' && followingNow.current) placeReading(scroller);
  });
  const { following, follow, release } = useFollowPlayback(
    tabs.scrollerRef,
    tabs.tab === 'transcript',
  );
  useLayoutEffect(() => {
    followingNow.current = following;
  }, [following]);
  const onSeek = useCallback(
    (at: number) => {
      // Before the render that opens the tab places the reading.
      followingNow.current = true;
      follow();
      playAt(at);
    },
    [follow, playAt],
  );

  function onSearch(value: string): void {
    setSearch(value);
    setMatch(null);
  }

  function selectTab(next: DetailTab): void {
    if (next !== 'transcript') setPassage(null);
    tabs.select(next);
  }

  const openPassage: TimestampHandler = (at, sourceId) => {
    passages.current += 1;
    setPassage({ sourceId, at, key: passages.current });
    onSeek(at);
    tabs.select('transcript');
  };

  return {
    tab: tabs.tab,
    selectTab,
    scrollerRef: tabs.scrollerRef,
    anchorRef: tabs.anchorRef,
    openPassage,
    transcript: {
      search,
      onSearch,
      match,
      onMatch: setMatch,
      following,
      onFollow: follow,
      onRelease: release,
      scrollerRef: tabs.scrollerRef,
      passage,
      onBackToNotes: () => selectTab('notes'),
      onSeek,
    },
  };
}
