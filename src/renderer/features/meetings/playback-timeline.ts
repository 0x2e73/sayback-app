import type { Meeting } from '../../../shared/contracts';

export interface PlaybackSource {
  src: string;
  /** Seconds from the start of the meeting. */
  start: number;
  duration: number;
}

export interface PlaybackTarget {
  position: number;
  offset: number;
}

export interface ResumeState {
  sources: readonly PlaybackSource[];
  position: number;
  at: number;
  duration: number;
  failed: boolean;
}

type PlayableMeeting = Pick<Meeting, 'id' | 'hasVideo' | 'duration' | 'audioChunks'>;

const finite = (value: number) => Number.isFinite(value);

/** The video carries the sound; otherwise one source per recorded extract, in time order. */
export function playbackSources(meeting: PlayableMeeting): PlaybackSource[] {
  const base = `meeting-media://local/${meeting.id}`;
  if (meeting.hasVideo) {
    const duration = finite(meeting.duration) ? Math.max(0, meeting.duration) : 0;
    return [{ src: `${base}/video`, start: 0, duration }];
  }
  return meeting.audioChunks
    .filter(
      (chunk) =>
        finite(chunk.start) && chunk.start >= 0 && finite(chunk.duration) && chunk.duration > 0,
    )
    .sort((a, b) => a.start - b.start || a.index - b.index)
    .map((chunk) => ({
      src: `${base}/audio/${chunk.index}`,
      start: chunk.start,
      duration: chunk.duration,
    }));
}

export function timelineEnd(sources: readonly PlaybackSource[], duration: number): number {
  const last = sources.at(-1);
  const end = last ? last.start + last.duration : 0;
  return Math.max(end, finite(duration) ? duration : 0);
}

/** A time in a gap between two extracts plays from the start of the next one. */
export function locate(sources: readonly PlaybackSource[], at: number): PlaybackTarget | null {
  const time = finite(at) ? Math.max(0, at) : 0;
  const position = Math.max(
    0,
    sources.findLastIndex((source) => source.start <= time),
  );
  const source = sources[position];
  if (!source) return null;
  const offset = time - source.start;
  if (offset < source.duration) return { position, offset: Math.max(0, offset) };
  if (position + 1 < sources.length) return { position: position + 1, offset: 0 };
  return { position, offset: source.duration };
}

export function timelineTime(source: PlaybackSource, currentTime: number): number {
  const offset = finite(currentTime) ? Math.min(Math.max(0, currentTime), source.duration) : 0;
  return source.start + offset;
}

/** Where « Lire » starts when it does not simply carry on: null means carry on. */
export function resumePoint({
  sources,
  position,
  at,
  duration,
  failed,
}: ResumeState): number | null {
  if (failed) return sources[position + 1]?.start ?? at;
  if (at >= duration) return 0;
  return null;
}
