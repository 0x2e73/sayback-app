// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { Result } from '../shared/contracts';
import { ok } from './test-api';
import { useFullScreen } from './use-full-screen';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-fullscreen');
});

function fakeApi(initial: boolean) {
  let listener: (fullScreen: boolean) => void = () => {};
  const stop = vi.fn();
  const api = {
    isFullScreen: () => ok(initial),
    onFullScreenChange: (next: (fullScreen: boolean) => void) => {
      listener = next;
      return stop;
    },
  };
  return { api, stop, emit: (fullScreen: boolean) => listener(fullScreen) };
}

it('marks the root while the window is in full screen', async () => {
  const { api, emit } = fakeApi(true);
  renderHook(() => useFullScreen(api));
  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-fullscreen'));
  emit(false);
  expect(document.documentElement).not.toHaveAttribute('data-fullscreen');
  emit(true);
  expect(document.documentElement).toHaveAttribute('data-fullscreen');
});

it('stops listening when the app goes away', () => {
  const { api, stop } = fakeApi(false);
  const view = renderHook(() => useFullScreen(api));
  view.unmount();
  expect(stop).toHaveBeenCalledOnce();
});

it('ignores the answer to isFullScreen once a change event has arrived', async () => {
  let answer: (result: Result<boolean>) => void = () => {};
  const { api, emit } = fakeApi(false);
  const slow = { ...api, isFullScreen: () => new Promise<Result<boolean>>((r) => (answer = r)) };
  renderHook(() => useFullScreen(slow));
  emit(false);
  answer({ ok: true, value: true });
  await Promise.resolve();
  await Promise.resolve();
  expect(document.documentElement).not.toHaveAttribute('data-fullscreen');
});

it('takes the answer to isFullScreen when no event came first', async () => {
  let answer: (result: Result<boolean>) => void = () => {};
  const { api } = fakeApi(false);
  const slow = { ...api, isFullScreen: () => new Promise<Result<boolean>>((r) => (answer = r)) };
  renderHook(() => useFullScreen(slow));
  answer({ ok: true, value: true });
  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-fullscreen'));
});
