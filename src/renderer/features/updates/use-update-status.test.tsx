// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { UpdateStatus } from '../../../shared/contracts';
import { apiFor, ok, upToDate } from '../../test-api';
import { useUpdateStatus } from './use-update-status';

afterEach(cleanup);

const available: UpdateStatus = {
  ...upToDate,
  available: { version: '0.2.0', commit: 'b'.repeat(40), builtAt: '2026-10-14T10:00:00.000Z' },
};

it('reads the status on mount and follows the changes', async () => {
  const api = apiFor();
  let emit: (status: UpdateStatus) => void = () => undefined;
  api.getUpdateStatus = () => ok(upToDate);
  api.onUpdateStatus = (listener) => {
    emit = listener;
    return () => undefined;
  };
  const { result } = renderHook(() => useUpdateStatus(api));
  expect(result.current).toBeNull();
  await vi.waitFor(() => expect(result.current).toEqual(upToDate));
  act(() => emit(available));
  expect(result.current).toEqual(available);
});

it('unsubscribes on unmount', () => {
  const api = apiFor();
  const unsubscribe = vi.fn();
  api.onUpdateStatus = () => unsubscribe;
  const { unmount } = renderHook(() => useUpdateStatus(api));
  unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it('ignores a read that resolves after unmount', async () => {
  const api = apiFor();
  let resolve: (value: Awaited<ReturnType<typeof api.getUpdateStatus>>) => void = () => undefined;
  api.getUpdateStatus = () => new Promise((done) => (resolve = done));
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { result, unmount } = renderHook(() => useUpdateStatus(api));
  unmount();
  await act(async () => resolve({ ok: true, value: available }));
  expect(result.current).toBeNull();
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

it('keeps a pushed status when an older read resolves later', async () => {
  const api = apiFor();
  let emit: (status: UpdateStatus) => void = () => undefined;
  let resolve: (value: Awaited<ReturnType<typeof api.getUpdateStatus>>) => void = () => undefined;
  api.getUpdateStatus = () => new Promise((done) => (resolve = done));
  api.onUpdateStatus = (listener) => {
    emit = listener;
    return () => undefined;
  };
  const { result } = renderHook(() => useUpdateStatus(api));
  act(() => emit(available));
  await act(async () => resolve({ ok: true, value: upToDate }));
  expect(result.current).toEqual(available);
});
