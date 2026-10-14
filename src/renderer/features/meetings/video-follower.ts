/** What the follower needs from a <video> element; a plain object in the tests. */
export interface VideoLike {
  currentTime: number;
  readonly ended: boolean;
  play(): Promise<void>;
  pause(): void;
}

/** Past this gap the picture is put back on the sound (seconds). */
const MAX_DRIFT = 0.5;

/**
 * The muted video of a meeting follows the audio, which drives the timeline. A video that
 * stalls, fails or stops early stays on its last frame and never holds the sound back.
 */
export class VideoFollower {
  private video: VideoLike | null = null;
  private ready = false;
  private broken = false;
  private pendingAt: number | null = null;
  private playing = false;

  /** React detaches the ref before the unmount cleanup: keep the last element for stop(). */
  attach(video: VideoLike | null): void {
    if (video) this.video = video;
  }

  loadedMetadata(): void {
    this.ready = true;
    if (this.pendingAt !== null && this.video) this.video.currentTime = this.pendingAt;
    this.pendingAt = null;
    if (this.playing) this.start();
  }

  failed(): void {
    this.broken = true;
  }

  seek(at: number): void {
    if (this.broken) return;
    if (!this.ready || !this.video) {
      this.pendingAt = at;
      return;
    }
    this.video.currentTime = at;
  }

  setPlaying(play: boolean): void {
    this.playing = play;
    if (this.broken || !this.ready) return;
    if (play) this.start();
    else this.video?.pause();
  }

  /** Called as the audio plays: a video that fell behind jumps back, one that ended stays put. */
  drift(at: number): void {
    const video = this.video;
    if (this.broken || !this.ready || !video || video.ended) return;
    if (Math.abs(video.currentTime - at) > MAX_DRIFT) video.currentTime = at;
  }

  stop(): void {
    this.playing = false;
    this.video?.pause();
  }

  private start(): void {
    void this.video?.play().catch(() => undefined);
  }
}
