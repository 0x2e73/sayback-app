// Shared by the transcript tests.
import { useState, type RefObject } from 'react';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { Meeting, Segment } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { createPlaybackClock, type PlaybackClock } from './playback-clock';
import { Transcript } from './Transcript';
import type { Passage, TranscriptView } from './use-detail-view';

const chunk = (index: number, start: number, duration = 600) => ({
  index,
  start,
  duration,
  transcript: [],
});

export function meetingWith(transcript: Segment[], extra: Partial<Meeting> = {}): Meeting {
  return meetingFixture('m1', 'Réunion', '2026-10-15T08:00:00Z', {
    status: 'ready',
    duration: 1300,
    audioChunks: [chunk(0, 0), chunk(1, 600), chunk(2, 1200, 100)],
    transcript,
    ...extra,
  });
}

export const handlers = {
  onSeek: vi.fn(),
  onFollow: vi.fn(),
  onRelease: vi.fn(),
  onBackToNotes: vi.fn(),
  onAnalyze: vi.fn(),
};

const NO_SCROLLER: RefObject<HTMLDivElement | null> = { current: null };

export interface HarnessProps {
  meeting: Meeting;
  clock?: PlaybackClock;
  analyzing?: boolean;
  following?: boolean;
  passage?: Passage | null;
  scroller?: RefObject<HTMLDivElement | null>;
}

export function TranscriptHarness(props: HarnessProps) {
  const [search, setSearch] = useState('');
  const [match, setMatch] = useState<string | null>(null);
  const [clock] = useState(() => props.clock ?? createPlaybackClock());
  const view: TranscriptView = {
    search,
    onSearch: (value) => {
      setSearch(value);
      setMatch(null);
    },
    match,
    onMatch: setMatch,
    following: props.following ?? true,
    onFollow: handlers.onFollow,
    onRelease: handlers.onRelease,
    scrollerRef: props.scroller ?? NO_SCROLLER,
    passage: props.passage ?? null,
    onBackToNotes: handlers.onBackToNotes,
    onSeek: handlers.onSeek,
  };
  return (
    <Transcript
      meeting={props.meeting}
      analyzing={props.analyzing ?? false}
      clock={clock}
      view={view}
      onAnalyze={handlers.onAnalyze}
    />
  );
}

/** Records the element each scrollIntoView call moved, with its options. */
export function recordScrolls() {
  const scrolled = vi.fn<(element: Element, options?: boolean | ScrollIntoViewOptions) => void>();
  Element.prototype.scrollIntoView = function scrollIntoView(
    this: Element,
    options?: boolean | ScrollIntoViewOptions,
  ) {
    scrolled(this, options);
  };
  return scrolled;
}

export const turnOf = (text: string) => screen.getByText(text).closest('article');
