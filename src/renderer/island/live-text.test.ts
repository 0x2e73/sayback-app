import { describe, expect, it } from 'vitest';
import type { IslandLiveSnapshot, LiveSegment } from '../../shared/live';
import { applyLive, liveTurns, upsertSegment } from './live-text';

const segment = (extra: Partial<LiveSegment> = {}): LiveSegment => ({
  id: 'microphone-1',
  track: 'microphone',
  text: 'On valide',
  start: 1,
  end: 2,
  final: false,
  revision: 1,
  ...extra,
});

const ready: IslandLiveSnapshot = {
  enabled: true,
  availability: { state: 'ready' },
  segments: [segment()],
};

describe('upsertSegment', () => {
  it('replaces a segment with a higher revision only', () => {
    const revised = segment({ text: 'On valide le budget', revision: 2 });
    expect(upsertSegment([segment()], revised)).toEqual([revised]);
    const stale = segment({ text: 'On', revision: 1 });
    const kept = [revised];
    expect(upsertSegment(kept, stale)).toBe(kept);
  });

  it('adds a new segment and removes one whose final text is empty', () => {
    const other = segment({ id: 'system-1', track: 'system', text: 'Ça me va' });
    expect(upsertSegment([segment()], other)).toEqual([segment(), other]);
    expect(
      upsertSegment([segment(), other], segment({ text: ' ', final: true, revision: 2 })),
    ).toEqual([other]);
  });
});

describe('applyLive', () => {
  it('replaces everything on a snapshot, the text turned off included', () => {
    expect(applyLive(ready, { kind: 'replace', snapshot: { enabled: false } })).toEqual({
      enabled: false,
    });
  });

  it('drops a segment before the first snapshot or while the text is off', () => {
    expect(applyLive(null, { kind: 'segment', segment: segment() })).toBeNull();
    const off: IslandLiveSnapshot = { enabled: false };
    expect(applyLive(off, { kind: 'segment', segment: segment() })).toBe(off);
  });

  it('keeps the same state for a stale revision', () => {
    expect(applyLive(ready, { kind: 'segment', segment: segment({ revision: 0 }) })).toBe(ready);
  });
});

describe('liveTurns', () => {
  it('joins consecutive words of a track in time order and keeps the latest turns', () => {
    const segments = [
      segment({ id: 'system-1', track: 'system', text: 'Ça me va.', start: 5 }),
      segment({ id: 'microphone-1', text: 'On valide le budget', start: 1 }),
      segment({ id: 'microphone-2', text: 'jeudi.', start: 3 }),
      segment({ id: 'system-2', track: 'system', text: '  ', start: 6 }),
    ];
    expect(liveTurns(segments)).toEqual([
      { key: 'microphone-1', track: 'microphone', text: 'On valide le budget jeudi.' },
      { key: 'system-1', track: 'system', text: 'Ça me va.' },
    ]);
    const many = Array.from({ length: 6 }, (_, index) =>
      segment({ id: `s-${index}`, track: index % 2 ? 'system' : 'microphone', start: index }),
    );
    expect(liveTurns(many).map((turn) => turn.key)).toEqual(['s-2', 's-3', 's-4', 's-5']);
  });
});
