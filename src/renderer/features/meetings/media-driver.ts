/** What the driver needs from an <audio> or <video> element; a plain object in the tests. */
export interface MediaLike {
  currentTime: number;
  readonly ended: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
}

interface Target {
  offset: number;
  play: boolean;
}

/**
 * Drives the one media element of a meeting. A target aimed at a source that is not
 * loaded waits for its metadata: a currentTime set earlier is lost when the source changes.
 */
export class MediaDriver {
  private media: MediaLike | null = null;
  private loaded = false;
  private target: Target | null = null;

  /** React detaches the ref before the unmount cleanup: keep the last element for stop(). */
  attach(media: MediaLike | null): void {
    if (media) this.media = media;
  }

  get waiting(): boolean {
    return this.target !== null;
  }

  get ended(): boolean {
    return this.media?.ended ?? false;
  }

  /** The element is about to receive another source. */
  queue(offset: number, play: boolean): void {
    this.loaded = false;
    this.target = { offset, play };
  }

  /** The same source failed: the element fetches it again. */
  retry(offset: number, play: boolean): void {
    this.queue(offset, play);
    this.media?.load();
  }

  seek(offset: number, play: boolean): void {
    if (!this.loaded || !this.media) {
      this.target = { offset, play };
      return;
    }
    this.media.currentTime = offset;
    this.setPlaying(play);
  }

  setPlaying(play: boolean): void {
    if (this.target) {
      this.target = { ...this.target, play };
      return;
    }
    if (play) this.resume();
    else this.media?.pause();
  }

  loadedMetadata(): void {
    this.loaded = true;
    const target = this.target;
    if (!target || !this.media) return;
    this.target = null;
    this.media.currentTime = target.offset;
    if (target.play) this.resume();
  }

  failed(): void {
    this.loaded = false;
    this.target = null;
  }

  stop(): void {
    this.target = null;
    this.media?.pause();
  }

  private resume(): void {
    // A play interrupted by a source change rejects; the queued target starts it again.
    void this.media?.play().catch(() => undefined);
  }
}
