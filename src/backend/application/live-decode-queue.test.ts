import { describe, expect, it } from 'vitest';
import type { LiveTrack } from '../../shared/live';
import { LiveDecodeQueue, type DecodeJob } from './live-decode-queue';

function job(track: LiveTrack, kind: 'partial' | 'final', id: number, end = 1): DecodeJob {
  return { track, event: { kind, id, start: 0, end, samples: new Int16Array(1) } };
}

function drain(queue: LiveDecodeQueue): string[] {
  const order: string[] = [];
  for (let next = queue.next(); next; next = queue.next()) {
    order.push(`${next.track}:${next.event.kind}:${next.event.id}@${next.event.end}`);
  }
  return order;
}

describe('live decode queue', () => {
  it('is empty at first', () => {
    const queue = new LiveDecodeQueue();

    expect(queue.next()).toBeUndefined();
    expect(queue.size).toBe(0);
  });

  it('serves finals in order before any partial', () => {
    const queue = new LiveDecodeQueue();
    queue.push(job('microphone', 'partial', 3));
    queue.push(job('system', 'final', 1));
    queue.push(job('microphone', 'final', 2));

    expect(drain(queue)).toEqual([
      'system:final:1@1',
      'microphone:final:2@1',
      'microphone:partial:3@1',
    ]);
  });

  it('keeps only the latest partial of a track', () => {
    const queue = new LiveDecodeQueue();
    queue.push(job('microphone', 'partial', 0, 2));
    queue.push(job('microphone', 'partial', 0, 4));
    queue.push(job('system', 'partial', 5, 2));

    expect(drain(queue)).toEqual(['microphone:partial:0@4', 'system:partial:5@2']);
  });

  it('drops the waiting partial of an utterance once its final arrives', () => {
    const queue = new LiveDecodeQueue();
    queue.push(job('microphone', 'partial', 0, 2));
    queue.push(job('microphone', 'final', 0, 3));

    expect(drain(queue)).toEqual(['microphone:final:0@3']);
  });

  it('forgets everything on clear', () => {
    const queue = new LiveDecodeQueue();
    queue.push(job('microphone', 'partial', 0));
    queue.push(job('system', 'final', 1));

    queue.clear();

    expect(queue.next()).toBeUndefined();
  });
});
