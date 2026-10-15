/** The still kept with the meeting every 30 s, up to 1280 px wide. */
const STILL = { width: 1280, quality: 0.65, interval: 30_000, max: 240 } as const;
/** The island's preview: 138 pt on a Retina screen, about once a second. */
export const PREVIEW = { width: 276, quality: 0.6, interval: 1_000 } as const;

/** Where the frames of a capture go, and what stops them. */
export interface FrameSink {
  paused(): boolean;
  stopped(): boolean;
  /** Seconds recorded, for the still's timestamp. */
  elapsed(): number;
  /** A still stored with the meeting. */
  store(index: number, at: number, jpeg: Blob): void;
  /** A preview frame for the island; the main process drops it when no island is shown. */
  preview(jpeg: Uint8Array): void;
}

/** The current frame of the video, at most `maxWidth` wide, as JPEG bytes; null before any frame. */
export function jpegFrame(
  video: HTMLVideoElement,
  maxWidth: number,
  quality: number,
): Uint8Array<ArrayBuffer> | null {
  if (!video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(video.videoWidth, maxWidth);
  canvas.height = Math.round((canvas.width * video.videoHeight) / video.videoWidth);
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/jpeg', quality).split(',')[1];
  if (!data) return null;
  return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
}

/**
 * Reads frames of the shared display from one hidden video element: a still once it plays and
 * every 30 s for the meeting, a small preview every second for the island. Timers, not
 * animation frames: the page that records is often hidden.
 */
export class CaptureFrames {
  private video?: HTMLVideoElement;
  private stillTimer?: ReturnType<typeof setInterval>;
  private previewTimer?: ReturnType<typeof setInterval>;
  private stills = 0;

  constructor(private readonly sink: FrameSink) {}

  follow(display: MediaStream): void {
    this.release();
    const video = document.createElement('video');
    video.srcObject = display;
    video.muted = true;
    this.video = video;
    void video
      .play()
      .then(() => this.still())
      .catch(() => undefined);
    this.stillTimer = setInterval(() => this.still(), STILL.interval);
    this.previewTimer = setInterval(() => this.preview(), PREVIEW.interval);
  }

  /** Stops the timers and lets the display go. */
  release(): void {
    clearInterval(this.stillTimer);
    clearInterval(this.previewTimer);
    this.video?.pause();
    if (this.video) this.video.srcObject = null;
    this.video = undefined;
  }

  private idle(): boolean {
    return this.sink.paused() || this.sink.stopped() || !this.video;
  }

  private still(): void {
    if (this.idle() || !this.video || this.stills >= STILL.max) return;
    const at = this.sink.elapsed();
    const jpeg = jpegFrame(this.video, STILL.width, STILL.quality);
    if (jpeg) this.sink.store(this.stills++, at, new Blob([jpeg], { type: 'image/jpeg' }));
  }

  // Paused, nothing is sent: the island keeps the last frame, dimmed.
  private preview(): void {
    if (this.idle() || !this.video) return;
    const jpeg = jpegFrame(this.video, PREVIEW.width, PREVIEW.quality);
    if (!jpeg) return;
    try {
      this.sink.preview(jpeg);
    } catch {
      // The preview is a bonus: the recording goes on without it.
    }
  }
}
