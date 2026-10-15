import { describe, expect, it } from 'vitest';
import {
  flushSegmenter,
  initialSegmenter,
  segment,
  segmentAt,
  type SegmenterEvent,
  type SegmenterState,
} from './live-segmenter';
import { concat, silence, tone } from './live-test-signals';

const RATE = 16_000;

interface Run {
  state: SegmenterState;
  events: SegmenterEvent[];
}

/** Sends the signal in blocks, as the page does, then flushes when asked. */
function run(signal: Int16Array, block = 3_200, flush = false, from = initialSegmenter()): Run {
  let state = from;
  const events: SegmenterEvent[] = [];
  for (let offset = 0; offset < signal.length; offset += block) {
    const step = segment(state, signal.subarray(offset, offset + block));
    state = step.state;
    events.push(...step.events);
  }
  if (flush) {
    const step = flushSegmenter(state);
    state = step.state;
    events.push(...step.events);
  }
  return { state, events };
}

const shape = (events: SegmenterEvent[]) =>
  events.map(({ kind, id, start, end }) => ({ kind, id, start, end }));

describe('live segmenter', () => {
  it('returns nothing for an empty block', () => {
    const step = segment(initialSegmenter(), new Int16Array(0));

    expect(step.events).toEqual([]);
    expect(step.state.frameIndex).toBe(0);
    expect(step.state.open).toBeNull();
  });

  it('keeps silence and quiet room noise out, even after a flush', () => {
    const { events, state } = run(concat(silence(3_000), tone(2_000, 300)), 3_200, true);

    expect(events).toEqual([]);
    expect(state.frameIndex).toBe(250);
  });

  it('ignores a 40 ms blip that never opens an utterance', () => {
    const { events } = run(concat(silence(200), tone(40), silence(1_000)), 3_200, true);

    expect(events).toEqual([]);
  });

  it('drops a 100 ms blip that opens but holds too little speech', () => {
    const { events } = run(concat(silence(200), tone(100), silence(1_000)), 3_200, true);

    expect(events).toEqual([]);
  });

  it('closes one utterance after 600 ms of silence, with pre-roll and a short tail', () => {
    const { events } = run(concat(silence(200), tone(1_000), silence(1_000)));

    expect(shape(events)).toEqual([{ kind: 'final', id: 0, start: 0, end: 1.4 }]);
    expect(events[0]!.samples).toHaveLength(1.4 * RATE);
  });

  it('decodes continuous speech again every 2 s and closes it on the flush', () => {
    const { events } = run(tone(5_000), 3_200, true);

    expect(shape(events)).toEqual([
      { kind: 'partial', id: 0, start: 0, end: 2 },
      { kind: 'partial', id: 0, start: 0, end: 4 },
      { kind: 'final', id: 0, start: 0, end: 5 },
    ]);
  });

  it('cuts a long utterance at its quietest frame of the last 3 s', () => {
    const signal = concat(tone(13_500), silence(20), tone(6_480));

    const finals = run(signal, 3_200, true).events.filter((event) => event.kind === 'final');

    expect(shape(finals)).toEqual([
      { kind: 'final', id: 0, start: 0, end: 13.5 },
      { kind: 'final', id: 1, start: 13.5, end: 20 },
    ]);
  });

  it('caps an utterance without any pause at 15 s and keeps every sample', () => {
    const { events } = run(tone(16_000), 3_200, true);
    const finals = events.filter((event) => event.kind === 'final');

    expect(shape(finals)).toEqual([
      { kind: 'final', id: 0, start: 0, end: 14.98 },
      { kind: 'final', id: 1, start: 14.98, end: 16 },
    ]);
    expect(finals[0]!.samples.length + finals[1]!.samples.length).toBe(16 * RATE);
  });

  it('splits on a 700 ms pause and keeps a 400 ms pause inside one utterance', () => {
    const split = run(concat(tone(1_000), silence(700), tone(1_000), silence(1_000)));
    const kept = run(concat(tone(1_000), silence(400), tone(1_000), silence(1_000)));

    expect(shape(split.events)).toEqual([
      { kind: 'final', id: 0, start: 0, end: 1.2 },
      { kind: 'final', id: 1, start: 1.5, end: 2.9 },
    ]);
    expect(shape(kept.events)).toEqual([
      { kind: 'partial', id: 0, start: 0, end: 2 },
      { kind: 'final', id: 0, start: 0, end: 2.6 },
    ]);
  });

  it('closes on a pause and goes on with the track clock after it', () => {
    const before = run(tone(1_000), 3_200, true);
    const after = run(tone(1_000), 3_200, true, before.state);

    expect(shape(before.events)).toEqual([{ kind: 'final', id: 0, start: 0, end: 1 }]);
    expect(shape(after.events)).toEqual([{ kind: 'final', id: 1, start: 1, end: 2 }]);
  });

  it('gives the same utterances whatever the block size, and modifies no input', () => {
    const signal = concat(tone(1_000), silence(700), tone(1_000), silence(1_000));
    const copy = signal.slice();
    const start = initialSegmenter();

    const whole = run(signal, signal.length);
    const odd = run(signal, 777);
    const tiny = run(signal, 37, false, start);

    expect(shape(odd.events)).toEqual(shape(whole.events));
    expect(shape(tiny.events)).toEqual(shape(whole.events));
    expect(odd.events.map((event) => event.samples)).toEqual(
      whole.events.map((event) => event.samples),
    );
    expect(signal).toEqual(copy);
    expect(start).toEqual(initialSegmenter());
  });
  it('closes the utterance on a gap in the audio and moves the clock past it', () => {
    let state = initialSegmenter();
    const events: SegmenterEvent[] = [];
    for (const [offset, block] of [
      [0, tone(1_000)],
      [32_000, tone(1_000)],
    ] as const) {
      const step = segmentAt(state, offset, block);
      state = step.state;
      events.push(...step.events);
    }
    events.push(...flushSegmenter(state).events);

    expect(shape(events)).toEqual([
      { kind: 'final', id: 0, start: 0, end: 1 },
      { kind: 'final', id: 1, start: 2, end: 3 },
    ]);
  });

  it('skips audio it has already seen and keeps the part that is new', () => {
    const first = segmentAt(initialSegmenter(), 0, tone(1_000));
    const repeated = segmentAt(first.state, 0, tone(1_000));
    const overlapping = segmentAt(first.state, 8_000, tone(1_000));

    expect(repeated.state).toBe(first.state);
    expect(overlapping.state.position).toBe(24_000);
  });

  it('raises the speech threshold over a noisy room, and still hears a clear voice', () => {
    const quietVoice = 1_100;
    const noisy = run(concat(tone(3_000, 463), tone(1_000, quietVoice), silence(1_000)));
    const quietRoom = run(concat(silence(3_000), tone(1_000, quietVoice), silence(1_000)));
    const clear = run(concat(tone(3_000, 463), tone(1_000), silence(1_000)));

    expect(noisy.events).toEqual([]);
    expect(quietRoom.events.map((event) => event.kind)).toEqual(['final']);
    expect(clear.events.map((event) => event.kind)).toEqual(['final']);
  });
});
