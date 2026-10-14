import type { MediaDriver } from './media-driver';
import { locate, resumePoint, timelineTime, type PlaybackSource } from './playback-timeline';
import type { VideoFollower } from './video-follower';

export interface PlaybackView {
  position: number;
  at: number;
  playing: boolean;
  failed: boolean;
}

export const INITIAL_VIEW: PlaybackView = { position: 0, at: 0, playing: false, failed: false };

/**
 * The playback decisions, outside React: the position and the intent are read synchronously,
 * so two calls in the same batch (a note, then its passage) stay right.
 */
export class PlaybackController {
  private view = INITIAL_VIEW;
  private sources: readonly PlaybackSource[] = [];
  private duration = 0;
  /** The loaded source could not be read: the next seek into it fetches it again. */
  private broken = false;

  constructor(
    readonly driver: MediaDriver,
    readonly follower: VideoFollower,
    private readonly publish: (view: PlaybackView) => void,
  ) {}

  setSources(sources: readonly PlaybackSource[], duration: number): void {
    this.sources = sources;
    this.duration = duration;
  }

  goTo(time: number, play: boolean): void {
    const target = locate(this.sources, time);
    const next = target ? this.sources[target.position] : undefined;
    if (!target || !next) return;
    const at = next.start + target.offset;
    const moved = target.position !== this.view.position;
    this.commit({ at, playing: play, failed: false, position: target.position });
    this.follower.seek(at);
    if (moved) this.driver.queue(target.offset, play);
    else if (this.broken) this.driver.retry(target.offset, play);
    else this.driver.seek(target.offset, play);
    this.broken = false;
  }

  seek(time: number): void {
    this.goTo(time, this.view.playing);
  }

  toggle(): void {
    const { playing, position, at } = this.view;
    if (!this.sources[position]) return;
    if (playing) {
      this.commit({ playing: false });
      this.driver.setPlaying(false);
      return;
    }
    const from = resumePoint({
      sources: this.sources,
      position,
      at,
      duration: this.duration,
      failed: this.broken,
    });
    if (from !== null) {
      this.goTo(from, true);
      return;
    }
    this.commit({ playing: true });
    this.driver.setPlaying(true);
  }

  /** The element reports its own play or pause. */
  confirmPlaying(playing: boolean): void {
    if (playing !== this.view.playing) this.commit({ playing });
  }

  /** An extract that reaches its end pauses before `ended`: the hand-over keeps the button. */
  paused(): void {
    if (!this.driver.ended) this.confirmPlaying(false);
  }

  ended(): void {
    if (!this.sources[this.view.position + 1]) {
      this.commit({ playing: false, at: this.duration });
      return;
    }
    this.advance();
  }

  timeUpdate(currentTime: number): void {
    const source = this.sources[this.view.position];
    // While another source loads, the element still reports the previous one.
    if (!source || this.driver.waiting) return;
    const at = timelineTime(source, currentTime);
    this.commit({ at });
    this.follower.drift(at);
  }

  /** The person paused the video with its own controls: the sound follows. */
  videoPaused(): void {
    if (!this.view.playing) return;
    this.commit({ playing: false });
    this.driver.setPlaying(false);
  }

  /** The person played the video with its own controls: the sound resumes where it is. */
  videoPlayed(): void {
    if (!this.view.playing) this.toggle();
  }

  loadedMetadata(): void {
    this.broken = false;
    this.driver.loadedMetadata();
  }

  /** An unreadable extract: playback moves on to the next one, the message stays. */
  failed(): void {
    this.driver.failed();
    this.broken = true;
    if (this.view.playing && this.sources[this.view.position + 1]) {
      this.commit({ failed: true });
      this.advance();
      return;
    }
    this.commit({ failed: true, playing: false });
  }

  stop(): void {
    this.driver.stop();
    this.follower.stop();
  }

  /** Starts the next extract from its first second. */
  private advance(): void {
    const position = this.view.position + 1;
    const next = this.sources[position];
    if (!next) return;
    this.broken = false;
    this.driver.queue(0, true);
    this.commit({ at: next.start, position });
  }

  private commit(patch: Partial<PlaybackView>): void {
    this.view = { ...this.view, ...patch };
    if (patch.playing !== undefined) this.follower.setPlaying(patch.playing);
    this.publish(this.view);
  }
}
