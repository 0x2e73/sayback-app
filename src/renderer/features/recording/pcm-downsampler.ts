/** Name under which `pcm-worklet.ts` registers its processor. */
export const PCM_PROCESSOR = 'sayback-pcm';
const OUTPUT_RATE = 16_000;
/** 200 ms at 16 kHz: five messages a second per track. */
export const PCM_BLOCK = 3_200;

export interface PcmDownsampler {
  /** One render quantum, one array per channel; returns the blocks completed by it. */
  push(channels: readonly Float32Array[]): Int16Array[];
}

function toInt16(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  return Math.round(clamped < 0 ? clamped * 32_768 : clamped * 32_767);
}

/**
 * Mixes the channels to mono and averages each 1/16 000 s of input into one sample: the average
 * is the low-pass that keeps the voice band from folding back. Works at any input rate from
 * 16 kHz up, the context's own rate included.
 */
export function createPcmDownsampler(inputRate: number, blockSize = PCM_BLOCK): PcmDownsampler {
  if (!Number.isInteger(inputRate) || inputRate < OUTPUT_RATE) {
    throw new Error('Fréquence audio non prise en charge pour le texte en direct.');
  }
  let sum = 0;
  let count = 0;
  let position = 0;
  let block = new Int16Array(blockSize);
  let filled = 0;

  function emit(value: number, blocks: Int16Array[]): void {
    block[filled] = toInt16(value);
    filled += 1;
    if (filled < blockSize) return;
    blocks.push(block);
    block = new Int16Array(blockSize);
    filled = 0;
  }

  return {
    push(channels) {
      const blocks: Int16Array[] = [];
      const length = channels[0]?.length ?? 0;
      for (let index = 0; index < length; index += 1) {
        let mono = 0;
        for (const channel of channels) mono += channel[index] ?? 0;
        sum += mono / channels.length;
        count += 1;
        // Counted in whole units, so 44.1 kHz gives exactly 16 000 samples a second.
        position += OUTPUT_RATE;
        if (position < inputRate) continue;
        position -= inputRate;
        emit(sum / count, blocks);
        sum = 0;
        count = 0;
      }
      return blocks;
    },
  };
}
