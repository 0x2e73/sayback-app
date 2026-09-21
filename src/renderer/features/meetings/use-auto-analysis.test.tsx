// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Meeting } from '../../../shared/contracts';
import { useAutoAnalysis } from './use-auto-analysis';

it('starts analysis after recording and publishes the finished meeting', async () => {
  const meeting: Meeting = {
    id: 'm1',
    title: 'Test',
    createdAt: '2026-09-12T12:00:00Z',
    status: 'recorded',
    duration: 60,
    hasVideo: false,
    audioChunks: [{ index: 0, start: 0, duration: 60, transcript: null }],
    frames: [],
    transcript: [],
    notes: null,
    clarifications: [],
    error: null,
  };
  const ready: Meeting = { ...meeting, status: 'ready' };
  const processMeeting = vi.fn(async () => ({ ok: true as const, value: ready }));
  const onUpdate = vi.fn();
  const { result } = renderHook(() =>
    useAutoAnalysis(
      { processMeeting, getMeeting: async () => ({ ok: true, value: meeting }) },
      onUpdate,
    ),
  );

  act(() => result.current.run(meeting));
  await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(ready));
  expect(processMeeting).toHaveBeenCalledWith('m1');
  expect(onUpdate.mock.calls[0]?.[0]).toMatchObject({ status: 'processing' });
});
