import { describe, expect, it } from 'vitest';
import { elapsedAt, recordingRequestSchema, recordingStateSchema } from './recording-state';

describe('elapsedAt', () => {
  it('counts on from the announced time while recording', () => {
    const state = { recording: true, elapsed: 30, paused: false, stopping: false } as const;
    expect(elapsedAt(state, 1_000, 1_000)).toBe(30);
    expect(elapsedAt(state, 1_000, 3_500)).toBe(32.5);
  });

  it('stays frozen while paused', () => {
    const state = { recording: true, elapsed: 30, paused: true, stopping: false } as const;
    expect(elapsedAt(state, 1_000, 61_000)).toBe(30);
  });

  it('stays frozen while the recording closes', () => {
    const state = { recording: true, elapsed: 42, paused: false, stopping: true } as const;
    expect(elapsedAt(state, 1_000, 9_000)).toBe(42);
  });

  it('never runs backwards when the clock reads earlier than the reception', () => {
    const state = { recording: true, elapsed: 5, paused: false, stopping: false } as const;
    expect(elapsedAt(state, 2_000, 1_000)).toBe(5);
  });

  it('is zero at rest', () => {
    expect(elapsedAt({ recording: false }, 0, 10_000)).toBe(0);
  });
});

describe('boundary schemas', () => {
  it('requires the closing flag during a recording', () => {
    expect(() =>
      recordingStateSchema.parse({ recording: true, elapsed: 1, paused: false }),
    ).toThrow();
    expect(
      recordingStateSchema.parse({ recording: true, elapsed: 1, paused: false, stopping: true }),
    ).toEqual({ recording: true, elapsed: 1, paused: false, stopping: true });
  });

  it.each(['pause', 'resume', 'stop'])('accepts the %s request', (request) => {
    expect(recordingRequestSchema.parse(request)).toBe(request);
  });

  it.each(['open', 'start', '', 1, null])('refuses the %j request', (request) => {
    expect(() => recordingRequestSchema.parse(request)).toThrow();
  });
});
