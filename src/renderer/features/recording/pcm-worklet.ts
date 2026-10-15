// Runs on the audio thread, loaded by `audioWorklet.addModule` from its own asset URL, never
// inlined as `data:`. It only converts: the page decides what to send and when.
import { createPcmDownsampler, PCM_PROCESSOR } from './pcm-downsampler';

// The worklet scope is not part of the DOM library.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

/** Posts 200 ms Int16 blocks at 16 kHz mono, the buffer transferred, not copied. */
class PcmProcessor extends AudioWorkletProcessor {
  private readonly downsampler = createPcmDownsampler(sampleRate);

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    for (const block of this.downsampler.push(channels)) {
      this.port.postMessage(block, [block.buffer]);
    }
    return true;
  }
}

registerProcessor(PCM_PROCESSOR, PcmProcessor);
