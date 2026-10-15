import { describe, expect, it } from 'vitest';
import { createPcmGate } from './live-pcm-gate';

const BLOCK = 3_200;

function sendEvery(gate: ReturnType<typeof createPcmGate>, clock: { time: number }, ms: number) {
  const admitted: boolean[] = [];
  for (let block = 0; block < 100; block += 1) {
    clock.time += ms;
    admitted.push(gate.admit('microphone', BLOCK), gate.admit('system', BLOCK));
  }
  return admitted;
}

describe('pcm gate', () => {
  it('admits real time on each track for as long as it lasts', () => {
    const clock = { time: 0 };
    const gate = createPcmGate(() => clock.time);

    expect(sendEvery(gate, clock, 200).every(Boolean)).toBe(true);
  });

  it('takes a burst of three seconds per track, then refuses', () => {
    const gate = createPcmGate(() => 0);

    const microphone = Array.from({ length: 16 }, () => gate.admit('microphone', BLOCK));

    expect(microphone.filter(Boolean)).toHaveLength(15);
    expect(gate.admit('system', BLOCK)).toBe(true);
  });

  it('refuses a page sending twice real time once its burst is spent', () => {
    const clock = { time: 0 };
    const gate = createPcmGate(() => clock.time);

    const admitted = sendEvery(gate, clock, 100);

    expect(admitted.slice(-20).filter(Boolean).length).toBeLessThan(14);
  });

  it('charges a tiny block as 100 ms', () => {
    const gate = createPcmGate(() => 0);

    const tiny = Array.from({ length: 40 }, () => gate.admit('microphone', 1));

    expect(tiny.filter(Boolean)).toHaveLength(30);
  });

  it('saves no credit during a pause', () => {
    const clock = { time: 0 };
    const gate = createPcmGate(() => clock.time);
    for (let block = 0; block < 15; block += 1) gate.admit('microphone', BLOCK);

    gate.setPaused(true);
    clock.time += 60_000;
    gate.setPaused(false);

    expect(gate.admit('microphone', BLOCK)).toBe(false);
    clock.time += 200;
    expect(gate.admit('microphone', BLOCK)).toBe(true);
  });

  it('gives the full burst again on reset', () => {
    const gate = createPcmGate(() => 0);
    for (let block = 0; block < 15; block += 1) gate.admit('microphone', BLOCK);

    gate.reset();

    expect(gate.admit('microphone', BLOCK)).toBe(true);
  });
});
