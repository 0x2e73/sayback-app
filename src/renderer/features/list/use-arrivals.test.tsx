// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useArrivals } from './use-arrivals';

afterEach(cleanup);

it('counts nothing as an arrival in the first list', () => {
  const { result } = renderHook(() => useArrivals(['a', 'b'], true));
  expect([...result.current]).toEqual([]);
});

it('waits for the list to load before it remembers anything', () => {
  const { result, rerender } = renderHook(({ ids, ready }) => useArrivals(ids, ready), {
    initialProps: { ids: [] as string[], ready: false },
  });
  rerender({ ids: ['a'], ready: true });
  expect([...result.current]).toEqual([]);
});

it('marks an id that was not there, and keeps it marked when it is hidden and shown again', () => {
  const { result, rerender } = renderHook(({ ids }) => useArrivals(ids, true), {
    initialProps: { ids: ['a'] },
  });
  rerender({ ids: ['a', 'b'] });
  expect([...result.current]).toEqual(['b']);
  rerender({ ids: ['a'] });
  rerender({ ids: ['a', 'b'] });
  expect([...result.current]).toEqual(['b']);
});
