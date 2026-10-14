// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { DesktopApi, Meeting, Result } from '../../../shared/contracts';
import { apiFor, meetingFixture } from '../../test-api';
import { useMeetings } from './use-meetings';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const first = meetingFixture('a', 'Premier', '2026-10-14T08:00:00Z');
const second = meetingFixture('b', 'Second', '2026-10-13T08:00:00Z');

type Reply = (result: Result<Meeting[]>) => void;

// Each call to listMeetings waits for the test to answer it, in any order.
function controlledApi(): { api: DesktopApi; replies: Reply[]; calls: () => number } {
  const replies: Reply[] = [];
  const api = apiFor();
  api.listMeetings = () => new Promise((resolve) => replies.push(resolve));
  return { api, replies, calls: () => replies.length };
}

it('ignores a list requested before a local deletion', async () => {
  const { api, replies } = controlledApi();
  const { result } = renderHook(() => useMeetings(api));
  await waitFor(() => expect(replies).toHaveLength(1));
  act(() => replies[0]?.({ ok: true, value: [first, second] }));
  await waitFor(() => expect(result.current.meetings).toHaveLength(2));

  let refreshing: Promise<void> = Promise.resolve();
  act(() => {
    refreshing = result.current.refresh();
  });
  await waitFor(() => expect(replies).toHaveLength(2));
  act(() => result.current.remove('a'));
  await act(async () => {
    replies[1]?.({ ok: true, value: [first, second] });
    await Promise.resolve();
  });
  expect(result.current.meetings.map((meeting) => meeting.id)).toEqual(['b']);

  // The stale answer is not trusted: the list is asked again, and that answer wins.
  await waitFor(() => expect(replies).toHaveLength(3));
  await act(async () => {
    replies[2]?.({ ok: true, value: [second] });
    await refreshing;
  });
  expect(result.current.meetings.map((meeting) => meeting.id)).toEqual(['b']);
});

it('ignores a list requested before a local update', async () => {
  const { api, replies } = controlledApi();
  const { result } = renderHook(() => useMeetings(api));
  await waitFor(() => expect(replies).toHaveLength(1));
  act(() => replies[0]?.({ ok: true, value: [first] }));
  await waitFor(() => expect(result.current.meetings).toHaveLength(1));

  act(() => {
    void result.current.refresh();
  });
  await waitFor(() => expect(replies).toHaveLength(2));
  act(() => result.current.update({ ...first, title: 'Renommé' }));
  await act(async () => {
    replies[1]?.({ ok: true, value: [first] });
    await Promise.resolve();
  });
  expect(result.current.meetings[0]?.title).toBe('Renommé');
});

it('does not start a poll while a request is in flight', async () => {
  vi.useFakeTimers();
  const { api, calls, replies } = controlledApi();
  const processing = { ...first, status: 'processing' as const };
  const { result } = renderHook(() => useMeetings(api));
  await act(async () => {
    replies[0]?.({ ok: true, value: [processing] });
    await Promise.resolve();
  });
  expect(result.current.meetings).toHaveLength(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(calls()).toBe(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(calls()).toBe(2);
});
