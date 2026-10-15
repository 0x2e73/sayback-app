import { describe, expect, it } from 'vitest';
import { createPcmGate } from './live-pcm-gate';

describe('pcm gate', () => {
  it('admits real time on each track, counted apart', () => {
    let time = 0;
    const gate = createPcmGate(() => time);

    const admitted: boolean[] = [];
    for (let block = 0; block < 50; block += 1) {
      time = block * 200;
      admitted.push(gate.admit('microphone', 3_200), gate.admit('system', 3_200));
    }

    expect(admitted.every(Boolean)).toBe(true);
  });

  it('refuses a track sending beyond twice real time plus a second', () => {
    let time = 0;
    const gate = createPcmGate(() => time);
    time = 1_000;

    expect(gate.admit('microphone', 16_000)).toBe(true);
    expect(gate.admit('microphone', 16_000)).toBe(true);
    expect(gate.admit('microphone', 16_000)).toBe(true);
    expect(gate.admit('microphone', 1)).toBe(false);
    expect(gate.admit('system', 16_000)).toBe(true);
  });

  it('starts counting again on reset', () => {
    let time = 0;
    const gate = createPcmGate(() => time);
    time = 60_000;
    gate.admit('microphone', 16_000);

    gate.reset();

    expect(gate.admit('microphone', 16_000)).toBe(true);
    expect(gate.admit('microphone', 1)).toBe(false);
  });
});
