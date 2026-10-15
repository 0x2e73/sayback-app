import { LIVE_SAMPLE_RATE, type LiveTrack } from '../shared/live';

export interface PcmGate {
  /** At the start of a recording: every track gets its full burst again. */
  reset(): void;
  /** The clock stops during a pause, so a pause saves no credit. */
  setPaused(paused: boolean): void;
  /** Takes the credit of one block; false when its track has none left. */
  admit(track: LiveTrack, samples: number): boolean;
}

// A token bucket per track counted in samples: three seconds of burst for a page that was
// throttled, refilled a little faster than real time so clock drift never starves it.
const BURST = 3 * LIVE_SAMPLE_RATE;
const REFILL_PER_MS = (1.1 * LIVE_SAMPLE_RATE) / 1_000;
// A tiny block costs as much as 100 ms: floods of one-sample messages stay bounded.
const MIN_COST = LIVE_SAMPLE_RATE / 10;

interface Bucket {
  tokens: number;
  at: number;
}

export function createPcmGate(now: () => number = () => performance.now()): PcmGate {
  const buckets = new Map<LiveTrack, Bucket>();
  let pausedFor = 0;
  let pausedAt: number | null = null;
  const clock = () => (pausedAt ?? now()) - pausedFor;

  return {
    reset() {
      buckets.clear();
      pausedFor = 0;
      pausedAt = null;
    },
    setPaused(paused) {
      if (paused && pausedAt === null) pausedAt = now();
      if (!paused && pausedAt !== null) {
        pausedFor += now() - pausedAt;
        pausedAt = null;
      }
    },
    admit(track, samples) {
      const at = clock();
      const bucket = buckets.get(track) ?? { tokens: BURST, at };
      const tokens = Math.min(BURST, bucket.tokens + (at - bucket.at) * REFILL_PER_MS);
      const cost = Math.max(samples, MIN_COST);
      const admitted = tokens >= cost;
      buckets.set(track, { tokens: admitted ? tokens - cost : tokens, at });
      return admitted;
    },
  };
}
