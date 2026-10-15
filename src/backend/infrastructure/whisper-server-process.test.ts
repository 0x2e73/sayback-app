import { describe, expect, it } from 'vitest';
import { parseListenerPids } from './whisper-server-process';

describe('lsof listener output', () => {
  it('reads one PID per process, once', () => {
    expect(parseListenerPids('p4242\nf3\np4242\nf7\np31337\nf4\n')).toEqual([4242, 31337]);
  });

  it('reads nothing from empty or foreign output', () => {
    expect(parseListenerPids('')).toEqual([]);
    expect(parseListenerPids('lsof: WARNING\npabc\nf3\n')).toEqual([]);
  });
});
