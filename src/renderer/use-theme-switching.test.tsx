// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useThemeSwitching } from './use-theme-switching';

const root = () => document.documentElement;

let frames: FrameRequestCallback[] = [];
let notify: () => void = () => {};
const removeListener = vi.fn();

function runFrame(): void {
  const callbacks = frames;
  frames = [];
  act(() => callbacks.forEach((callback) => callback(0)));
}

beforeEach(() => {
  frames = [];
  removeListener.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  vi.stubGlobal('matchMedia', (query: string) => {
    expect(query).toBe('(prefers-color-scheme: dark)');
    return {
      addEventListener: (_type: string, listener: () => void) => {
        notify = listener;
      },
      removeEventListener: removeListener,
    };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  root().removeAttribute('data-theme-switching');
});

it('freezes the transitions for two frames when the colour scheme changes', () => {
  renderHook(() => useThemeSwitching());
  expect(root()).not.toHaveAttribute('data-theme-switching');
  act(() => notify());
  expect(root()).toHaveAttribute('data-theme-switching');
  runFrame();
  expect(root()).toHaveAttribute('data-theme-switching');
  runFrame();
  expect(root()).not.toHaveAttribute('data-theme-switching');
});

it('starts the count again when the scheme changes twice in a row', () => {
  renderHook(() => useThemeSwitching());
  act(() => notify());
  runFrame();
  act(() => notify());
  runFrame();
  expect(root()).toHaveAttribute('data-theme-switching');
  runFrame();
  expect(root()).not.toHaveAttribute('data-theme-switching');
});

it('stops listening, and leaves the root clean, when the app goes away', () => {
  const view = renderHook(() => useThemeSwitching());
  act(() => notify());
  view.unmount();
  expect(removeListener).toHaveBeenCalledOnce();
  expect(root()).not.toHaveAttribute('data-theme-switching');
});

it('does nothing where the browser cannot tell the colour scheme', () => {
  vi.stubGlobal('matchMedia', undefined);
  expect(() => renderHook(() => useThemeSwitching())).not.toThrow();
});
