import { LIVE_SAMPLE_RATE, type LiveTrack } from '../shared/live';

export interface PcmGate {
  /** At the start of a recording. */
  reset(): void;
  /** False once a track has sent more than twice the time elapsed, plus one second. */
  admit(track: LiveTrack, samples: number): boolean;
}

// A page capturing real audio cannot go faster than real time: twice is a generous margin.
const SPEED_LIMIT = 2;
const ALLOWANCE_SECONDS = 1;

export function createPcmGate(now: () => number = () => performance.now()): PcmGate {
  let startedAt = now();
  const received = new Map<LiveTrack, number>();
  return {
    reset() {
      startedAt = now();
      received.clear();
    },
    admit(track, samples) {
      const seconds = ALLOWANCE_SECONDS + (SPEED_LIMIT * (now() - startedAt)) / 1_000;
      const total = (received.get(track) ?? 0) + samples;
      if (total > seconds * LIVE_SAMPLE_RATE) return false;
      received.set(track, total);
      return true;
    },
  };
}
