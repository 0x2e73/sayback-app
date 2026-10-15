// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Presence } from './Presence';

function Box({ open }: { open: boolean }) {
  return (
    <Presence open={open}>
      {({ ref, state }) => (
        <div ref={ref} data-state={state} data-testid="box">
          contenu
        </div>
      )}
    </Presence>
  );
}

function withTransition(duration: string): void {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    transitionDuration: duration,
  } as CSSStyleDeclaration);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('leaves at once when nothing transitions', () => {
  const view = render(<Box open />);
  view.rerender(<Box open={false} />);
  expect(screen.queryByTestId('box')).toBeNull();
});

it('stays closing until its opacity transition ends', () => {
  withTransition('0.15s');
  const view = render(<Box open />);
  view.rerender(<Box open={false} />);
  expect(screen.getByTestId('box')).toHaveAttribute('data-state', 'closing');
  fireEvent.transitionEnd(screen.getByTestId('box'), { propertyName: 'transform' });
  expect(screen.getByTestId('box')).toBeInTheDocument();
  fireEvent.transitionEnd(screen.getByTestId('box'), { propertyName: 'opacity' });
  expect(screen.queryByTestId('box')).toBeNull();
});

it('leaves after the safety delay if the transition never ends', () => {
  withTransition('0.15s');
  const view = render(<Box open />);
  view.rerender(<Box open={false} />);
  act(() => vi.advanceTimersByTime(399));
  expect(screen.getByTestId('box')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByTestId('box')).toBeNull();
});

it('comes back to open when reopened during the exit', () => {
  withTransition('0.15s');
  const view = render(<Box open />);
  view.rerender(<Box open={false} />);
  view.rerender(<Box open />);
  expect(screen.getByTestId('box')).toHaveAttribute('data-state', 'open');
  act(() => vi.advanceTimersByTime(1_000));
  expect(screen.getByTestId('box')).toBeInTheDocument();
});

it('mounts a fresh element when reopened after the exit', () => {
  const view = render(<Box open={false} />);
  expect(screen.queryByTestId('box')).toBeNull();
  view.rerender(<Box open />);
  expect(screen.getByTestId('box')).toHaveAttribute('data-state', 'open');
});
