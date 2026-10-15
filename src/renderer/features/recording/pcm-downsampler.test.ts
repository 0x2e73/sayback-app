import { describe, expect, it } from 'vitest';
import { createPcmDownsampler, PCM_BLOCK } from './pcm-downsampler';

const constant = (length: number, value: number) => new Float32Array(length).fill(value);

/** Feeds the signal in render quanta of 128 frames, as the audio thread does. */
function quanta(rate: number, channels: Float32Array[]): Int16Array[] {
  const downsampler = createPcmDownsampler(rate);
  const blocks: Int16Array[] = [];
  for (let offset = 0; offset < channels[0]!.length; offset += 128) {
    blocks.push(
      ...downsampler.push(channels.map((channel) => channel.subarray(offset, offset + 128))),
    );
  }
  return blocks;
}

describe('pcm downsampler', () => {
  it('turns 200 ms at 48 kHz into one block of 3 200 samples', () => {
    const blocks = quanta(48_000, [constant(9_600, 0.5)]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveLength(PCM_BLOCK);
    expect(new Set(blocks[0])).toEqual(new Set([16_384]));
  });

  it('keeps exactly 16 000 samples a second from 44.1 kHz', () => {
    const blocks = quanta(44_100, [constant(44_100, 0.25)]);

    expect(blocks).toHaveLength(5);
  });

  it('passes a 16 kHz context through unchanged', () => {
    const ramp = Float32Array.from({ length: PCM_BLOCK }, (_, index) => index / PCM_BLOCK - 0.5);

    const [block] = quanta(16_000, [ramp]);

    expect(block![0]).toBe(-16_384);
    expect(block![PCM_BLOCK / 2]).toBe(0);
  });

  it('mixes the channels to mono', () => {
    const [block] = quanta(48_000, [constant(9_600, 1), constant(9_600, -1)]);

    expect(new Set(block)).toEqual(new Set([0]));
  });

  it('clips beyond full scale', () => {
    const [loud] = quanta(16_000, [constant(PCM_BLOCK, 3)]);
    const [low] = quanta(16_000, [constant(PCM_BLOCK, -3)]);

    expect(new Set(loud)).toEqual(new Set([32_767]));
    expect(new Set(low)).toEqual(new Set([-32_768]));
  });

  it('returns nothing until a block is complete, and nothing for an empty quantum', () => {
    const downsampler = createPcmDownsampler(48_000);

    expect(downsampler.push([])).toEqual([]);
    expect(downsampler.push([constant(9_597, 0.1)])).toEqual([]);
    expect(downsampler.push([constant(3, 0.1)])).toHaveLength(1);
  });

  it('refuses a rate below 16 kHz or not a whole number', () => {
    expect(() => createPcmDownsampler(8_000)).toThrow();
    expect(() => createPcmDownsampler(Number.NaN)).toThrow();
    expect(() => createPcmDownsampler(44_100.5)).toThrow();
  });
});
