import type { SyntheticEvent } from 'react';

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

/** The muted video that follows the audio: it never reports back to the timeline. */
export interface FollowerVideoProps {
  ref(element: HTMLVideoElement | null): void;
  src: string;
  preload: 'metadata';
  muted: true;
  onLoadedMetadata(): void;
  onError(): void;
  /** Only the person's own play and pause: the follower's are filtered out. */
  onPlay(): void;
  onPause(): void;
}

export interface Playback {
  available: boolean;
  playing: boolean;
  failed: boolean;
  /** Seconds from the start of the meeting. */
  at: number;
  duration: number;
  /** Which element carries the timeline: the <audio> of the bar, or the <video> alone. */
  timeline: 'audio' | 'video';
  /** Spread on the one timeline element. */
  mediaProps: MediaElementProps;
  /** Spread on the <video> when the audio drives and a video exists, otherwise null. */
  videoProps: FollowerVideoProps | null;
  toggle(): void;
  /** Moves the position and keeps playing or paused: the progress bar. */
  seek(at: number): void;
  /** Moves the position and plays: a timestamp asks to hear the passage. */
  playAt(at: number): void;
}
