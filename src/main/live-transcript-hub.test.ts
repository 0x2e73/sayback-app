import { describe, expect, it, vi } from 'vitest';
import type { LiveSegment } from '../shared/live';
import {
  createLiveTranscriptHub,
  KEPT_FINALS,
  type LiveTranscriptEvent,
} from './live-transcript-hub';

function segment(n: number, revision = 0, final = true, text = `Phrase ${n}`): LiveSegment {
  return {
    id: `microphone-${n}`,
    track: 'microphone',
    text,
    start: n,
    end: n + 1,
    final,
    revision,
  };
}

function subscribed() {
  const hub = createLiveTranscriptHub();
  const events: LiveTranscriptEvent[] = [];
  hub.subscribe((event) => events.push(event));
  return { hub, events };
}

describe('live transcript hub', () => {
  it('starts off and empty', () => {
    expect(createLiveTranscriptHub().snapshot()).toEqual({
      availability: { state: 'off' },
      segments: [],
    });
  });

  it('replaces a draft by a higher revision in place and ignores an older one', () => {
    const { hub, events } = subscribed();

    hub.publish(segment(0, 0, false, 'Bon'));
    hub.publish(segment(1, 0, false, 'Autre'));
    hub.publish(segment(0, 1, true, 'Bonjour.'));
    hub.publish(segment(0, 0, false, 'Bon'));

    expect(hub.snapshot().segments.map(({ id, text }) => [id, text])).toEqual([
      ['microphone-0', 'Bonjour.'],
      ['microphone-1', 'Autre'],
    ]);
    expect(events).toHaveLength(3);
  });

  it('removes a draft closed by an empty final and tells the subscribers', () => {
    const { hub, events } = subscribed();
    hub.publish(segment(0, 0, false, 'Euh'));

    hub.publish(segment(0, 1, true, ''));

    expect(hub.snapshot().segments).toEqual([]);
    expect(events.at(-1)).toEqual({ kind: 'segment', segment: segment(0, 1, true, '') });
  });

  it(`keeps the last ${KEPT_FINALS} finals only`, () => {
    const { hub } = subscribed();

    for (let n = 0; n < KEPT_FINALS + 5; n += 1) hub.publish(segment(n));

    const ids = hub.snapshot().segments.map((item) => item.id);
    expect(ids).toHaveLength(KEPT_FINALS);
    expect(ids[0]).toBe('microphone-5');
  });

  it('bounds the drafts left open', () => {
    const { hub } = subscribed();

    for (let n = 0; n < 10; n += 1) hub.publish(segment(n, 0, false));

    expect(hub.snapshot().segments.map((item) => item.id)).toEqual([
      'microphone-6',
      'microphone-7',
      'microphone-8',
      'microphone-9',
    ]);
  });

  it('forgets everything on clear, once', () => {
    const { hub, events } = subscribed();
    hub.publish(segment(0));

    hub.clear();
    hub.clear();

    expect(hub.snapshot().segments).toEqual([]);
    expect(events.filter((event) => event.kind === 'cleared')).toHaveLength(1);
  });

  it('announces the availability and keeps it across a clear', () => {
    const { hub, events } = subscribed();

    hub.setAvailability({ state: 'unavailable', reason: 'no-model' });
    hub.clear();

    expect(hub.snapshot().availability).toEqual({ state: 'unavailable', reason: 'no-model' });
    expect(events).toEqual([
      { kind: 'availability', availability: { state: 'unavailable', reason: 'no-model' } },
    ]);
  });

  it('keeps serving the other subscribers when one fails, and stops after unsubscribe', () => {
    const hub = createLiveTranscriptHub();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const healthy = vi.fn();
    hub.subscribe(() => {
      throw new Error('fenêtre fermée');
    });
    const unsubscribe = hub.subscribe(healthy);

    hub.publish(segment(0));
    unsubscribe();
    hub.publish(segment(1));

    expect(healthy).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
