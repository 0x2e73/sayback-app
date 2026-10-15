/** Speech is read on a decibel scale: a quiet room sits at the floor, a raised voice at the top. */
export const LEVEL_FLOOR_DB = -55;
export const LEVEL_FULL_DB = -15;
/** Under this there is no signal at all, not a quiet room: a muted or dead source. */
export const SILENCE_DB = -90;
/** Share of the way to a louder level covered in one reading (ten a second): quick to rise. */
export const LEVEL_ATTACK = 0.7;
/** Share of the way down to a quieter level: slower to fall, so the bars do not flicker. */
export const LEVEL_RELEASE = 0.25;

/** Root mean square of samples between -1 and 1. */
export function rmsOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

/** dBFS of an RMS level; silence is minus infinity. */
export function decibelsOf(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/** The meter's level, 0 at the floor, 1 at the top, linear in decibels between them. */
export function meterLevel(decibels: number): number {
  const level = (decibels - LEVEL_FLOOR_DB) / (LEVEL_FULL_DB - LEVEL_FLOOR_DB);
  return Math.min(1, Math.max(0, level));
}

/** One reading later: rises fast, falls slower. */
export function smoothLevel(previous: number, next: number): number {
  const rate = next > previous ? LEVEL_ATTACK : LEVEL_RELEASE;
  return previous + (next - previous) * rate;
}
