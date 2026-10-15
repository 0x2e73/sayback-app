import { useCallback, useRef, useState, type RefObject } from 'react';
import type { TimestampHandler } from './Clarifications';
import { useFollowPlayback } from './use-follow-playback';
import { useTabScroll } from './use-tab-scroll';

export type DetailTab = 'notes' | 'transcript';

export interface Passage {
  sourceId: string;
  at: number;
  /** Grows at each note click, so the same passage flashes again. */
  key: number;
}

export interface TranscriptView {
  search: string;
  onSearch(value: string): void;
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
  const turn =
    scroller.querySelector('[data-passage]') ?? scroller.querySelector('[aria-current="time"]');
  turn?.scrollIntoView({ block: 'nearest' });
}

/** The tabs, the transcript search, the follow and the note passage outlive a change of tab. */
export function useDetailView(playAt: (at: number) => void): DetailView {
  const [search, setSearch] = useState('');
  const [passage, setPassage] = useState<Passage | null>(null);
  const passages = useRef(0);
  const tabs = useTabScroll<DetailTab>('notes', (tab, scroller) => {
    if (tab === 'transcript' && following) placeReading(scroller);
  });
  const { following, follow, release } = useFollowPlayback(
    tabs.scrollerRef,
    tabs.tab === 'transcript',
  );
  const onSeek = useCallback(
    (at: number) => {
      follow();
      playAt(at);
    },
    [follow, playAt],
  );

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
      onSearch: setSearch,
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
