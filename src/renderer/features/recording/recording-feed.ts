/** What the feed reads from the capture: the analyser of the mixed audio and the pause. */
export interface LevelSource {
  readonly paused: boolean;
  readonly analyser: {
    readonly frequencyBinCount: number;
    getByteFrequencyData(data: Uint8Array<ArrayBuffer>): void;
  };
}

export type LevelListener = (level: number) => void;

const LEVEL_INTERVAL = 100;

/** Mean of the spectrum, 0 to 1. */
export function levelOf(data: Uint8Array): number {
  if (data.length === 0) return 0;
  return data.reduce((sum, value) => sum + value, 0) / data.length / 255;
}

/** Reads the audio level ten times a second for the recording view and the island. */
export class RecordingFeed {
  private timer?: ReturnType<typeof setInterval>;
  private readonly listeners = new Set<LevelListener>();
  private readonly data: Uint8Array<ArrayBuffer>;

  constructor(
    private readonly source: LevelSource,
    private readonly send: LevelListener,
  ) {
    this.data = new Uint8Array(source.analyser.frequencyBinCount);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), LEVEL_INTERVAL);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Returns the function that stops listening. */
  onLevel(listener: LevelListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private tick(): void {
    let level = 0;
    if (!this.source.paused) {
      this.source.analyser.getByteFrequencyData(this.data);
      level = levelOf(this.data);
    }
    try {
      this.send(level);
    } catch {
      // The island is a bonus: the recording view keeps its meter.
    }
    for (const listener of this.listeners) listener(level);
  }
}
