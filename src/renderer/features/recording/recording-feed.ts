import { decibelsOf, meterLevel, rmsOf, SILENCE_DB, smoothLevel } from './level-scale';

/** What the feed reads from the capture: the analyser of the mixed audio and the pause. */
export interface LevelSource {
  readonly paused: boolean;
  readonly analyser: {
    readonly fftSize: number;
    getFloatTimeDomainData(data: Float32Array<ArrayBuffer>): void;
  };
}

export type LevelListener = (level: number) => void;
/** True when a signal arrived, however quiet; false for digital silence. */
export type SignalListener = (present: boolean) => void;

const LEVEL_INTERVAL = 100;

/**
 * Reads the audio ten times a second: the meter level, on a scale calibrated for speech and
 * smoothed, for the recording view and the island; and whether any signal arrives at all.
 */
export class RecordingFeed {
  private timer?: ReturnType<typeof setInterval>;
  private readonly listeners = new Set<LevelListener>();
  private readonly signalListeners = new Set<SignalListener>();
  private readonly data: Float32Array<ArrayBuffer>;
  private level = 0;

  constructor(
    private readonly source: LevelSource,
    private readonly send: LevelListener,
  ) {
    this.data = new Float32Array(source.analyser.fftSize);
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

  /** Not called while paused. Returns the function that stops listening. */
  onSignal(listener: SignalListener): () => void {
    this.signalListeners.add(listener);
    return () => {
      this.signalListeners.delete(listener);
    };
  }

  private tick(): void {
    if (this.source.paused) {
      this.level = 0;
    } else {
      this.source.analyser.getFloatTimeDomainData(this.data);
      const decibels = decibelsOf(rmsOf(this.data));
      this.level = smoothLevel(this.level, meterLevel(decibels));
      for (const listener of this.signalListeners) listener(decibels > SILENCE_DB);
    }
    try {
      this.send(this.level);
    } catch {
      // The island is a bonus: the recording view keeps its meter.
    }
    for (const listener of this.listeners) listener(this.level);
  }
}
