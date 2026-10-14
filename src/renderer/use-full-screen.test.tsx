// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
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
