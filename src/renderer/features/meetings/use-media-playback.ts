import { useEffect, useState, type SyntheticEvent } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { MediaDriver } from './media-driver';
import {
  locate,
  playbackSources,
  resumePoint,
  timelineEnd,
  timelineTime,
} from './playback-timeline';

export interface MediaElementProps {
  ref(element: HTMLMediaElement | null): void;
  src: string | undefined;
  preload: 'metadata';
  onLoadedMetadata(): void;
  onTimeUpdate(event: SyntheticEvent<HTMLMediaElement>): void;
  onPlay(): void;
  onPause(): void;
  onEnded(): void;
  onError(): void;
}

export interface Playback {
  available: boolean;
  playing: boolean;
  failed: boolean;
  /** Seconds from the start of the meeting. */
  at: number;
  duration: number;
  /** Spread on the one <audio> (footer) or <video> (top of the content). */
  mediaProps: MediaElementProps;
  toggle(): void;
  /** Moves the position and keeps playing or paused: the progress bar. */
  seek(at: number): void;
  /** Moves the position and plays: a timestamp asks to hear the passage. */
  playAt(at: number): void;
}

interface ElementEvents {
  onTimeUpdate(event: SyntheticEvent<HTMLMediaElement>): void;
  onEnded(): void;
  onError(): void;
  setPlaying(playing: boolean): void;
}

function elementProps(
  driver: MediaDriver,
  src: string | undefined,
  events: ElementEvents,
): MediaElementProps {
  return {
    ref: (element) => driver.attach(element),
    src,
    preload: 'metadata',
    onLoadedMetadata: () => driver.loadedMetadata(),
    onTimeUpdate: events.onTimeUpdate,
    onPlay: () => events.setPlaying(true),
    // An extract that reaches its end pauses before `ended`: the hand-over keeps the button.
    onPause: () => {
      if (!driver.ended) events.setPlaying(false);
    },
    onEnded: events.onEnded,
    onError: events.onError,
  };
}

export function useMediaPlayback(meeting: Meeting): Playback {
  // Rebuilt each render: the 2 s poll hands over equal sources, so `src` does not change.
  const sources = playbackSources(meeting);
  const duration = timelineEnd(sources, meeting.duration);
  const [driver] = useState(() => new MediaDriver());
  const [position, setPosition] = useState(0);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const source = sources[position];

  useEffect(() => () => driver.stop(), [driver]);

  function goTo(time: number, play: boolean): void {
    const target = locate(sources, time);
    const next = target ? sources[target.position] : undefined;
    if (!target || !next) return;
    setAt(next.start + target.offset);
    setPlaying(play);
    setFailed(false);
    if (target.position !== position) {
      driver.queue(target.offset, play);
      setPosition(target.position);
    } else if (failed) {
      driver.retry(target.offset, play);
    } else {
      driver.seek(target.offset, play);
    }
  }

  function toggle(): void {
    if (!source) return;
    if (playing) {
      setPlaying(false);
      driver.setPlaying(false);
      return;
    }
    const from = resumePoint({ sources, position, at, duration, failed });
    if (from !== null) {
      goTo(from, true);
      return;
    }
    setPlaying(true);
    driver.setPlaying(true);
  }

  function handleEnded(): void {
    const next = sources[position + 1];
    if (!next) {
      setPlaying(false);
      setAt(duration);
      return;
    }
    driver.queue(0, true);
    setAt(next.start);
    setPosition(position + 1);
  }

  function handleTimeUpdate(event: SyntheticEvent<HTMLMediaElement>): void {
    // While another source loads, the element still reports the previous one.
    if (!source || driver.waiting) return;
    setAt(timelineTime(source, event.currentTarget.currentTime));
  }

  function handleError(): void {
    driver.failed();
    setFailed(true);
    setPlaying(false);
  }

  return {
    available: sources.length > 0,
    playing,
    failed,
    at,
    duration,
    mediaProps: elementProps(driver, source?.src, {
      onTimeUpdate: handleTimeUpdate,
      onEnded: handleEnded,
      onError: handleError,
      setPlaying,
    }),
    toggle,
    seek: (time) => goTo(time, playing),
    playAt: (time) => goTo(time, true),
  };
}
