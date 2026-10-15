// Synthetic 16 kHz signals for the live tests; never imported by the application.
const RATE = 16_000;

/** A 200 Hz tone: four whole periods per 20 ms frame, so every frame has the same energy. */
export function tone(ms: number, amplitude = 8_000): Int16Array {
  const samples = new Int16Array((ms * RATE) / 1_000);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.round(amplitude * Math.sin((2 * Math.PI * 200 * index) / RATE));
  }
  return samples;
}

export const silence = (ms: number) => new Int16Array((ms * RATE) / 1_000);

export function concat(...parts: Int16Array[]): Int16Array {
  const total = new Int16Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    total.set(part, offset);
    offset += part.length;
  }
  return total;
}
